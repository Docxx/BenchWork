package app.benchwork

import android.Manifest
import android.app.Activity
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Native transport only. Label protocol and all print decisions stay in the shared client. */
@Suppress("DEPRECATION", "MissingPermission")
class LabelBluetooth(private val activity: Activity) {
  private val incoming = ConcurrentLinkedQueue<ByteArray>()
  private val discoveredNames = ConcurrentHashMap<String,String>()
  private var gatt: BluetoothGatt? = null
  private var writeCharacteristic: BluetoothGattCharacteristic? = null
  @Volatile private var socket: BluetoothSocket? = null
  @Volatile private var writeLatch: CountDownLatch? = null
  private var writeStatus = BluetoothGatt.GATT_FAILURE
  @Volatile private var receiveError: String? = null
  private fun nameAllowed(name: String?) = name?.uppercase()?.let { it.startsWith("B3S") || it.startsWith("NIIMBOT") } == true
  private fun adapter(): BluetoothAdapter {
    val required = if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT) else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    if (required.any { activity.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }) {
      activity.runOnUiThread { activity.requestPermissions(required, 7301) }
      throw IllegalStateException("Allow Nearby devices (or Location on older Android), then tap Search printers again.")
    }
    val adapter = (activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
      ?: throw IllegalStateException("This device has no Bluetooth adapter.")
    check(adapter.isEnabled) { "Turn Bluetooth on, then search again." }
    return adapter
  }
  @Synchronized fun scan(): JSONArray {
    val adapter = adapter()
    val found = ConcurrentHashMap<String, JSONObject>()
    adapter.bondedDevices.forEach { d -> if(nameAllowed(d.name)) found["classic:${d.address}"] = JSONObject().put("id","classic:${d.address}").put("name",d.name).put("transport","Bluetooth classic (paired)") }
    val scanner = adapter.bluetoothLeScanner ?: throw IllegalStateException("Bluetooth scanning is unavailable.")
    var failure: Int? = null
    val callback = object: ScanCallback() {
      override fun onScanFailed(errorCode: Int) { failure = errorCode }
      override fun onScanResult(type: Int, result: ScanResult) {
        val name = result.scanRecord?.deviceName ?: result.device.name
        if(nameAllowed(name)) found["ble:${result.device.address}"] = JSONObject().put("id","ble:${result.device.address}").put("name",name).put("transport","Bluetooth LE")
      }
    }
    scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), callback)
    try { Thread.sleep(5000) } finally { scanner.stopScan(callback) }
    check(failure == null) { "Bluetooth scan failed ($failure). Try again after closing other printer apps." }
    found.forEach { (id,value) -> discoveredNames[id]=value.getString("name") }
    return JSONArray(found.values.toList())
  }
  @Synchronized fun disconnect() {
    writeCharacteristic = null
    try { gatt?.disconnect(); gatt?.close() } finally { gatt = null }
    try { socket?.close() } finally { socket = null }
    incoming.clear(); receiveError = null
  }
  @Synchronized fun connect(id: String) {
    val adapter = adapter()
    disconnect()
    val parts = id.split(':', limit=2)
    check(parts.size == 2 && parts[0] in listOf("ble","classic")) { "Choose a discovered B3S." }
    val device = adapter.getRemoteDevice(parts[1])
    check(nameAllowed(device.name) || nameAllowed(discoveredNames[id])) { "Choose a NIIMBOT B3S printer." }
    if(parts[0] == "classic") {
      check(device.bondState == BluetoothDevice.BOND_BONDED) { "Pair the printer in Android Bluetooth settings first, or use its Bluetooth LE entry." }
      val connection = device.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805f9b34fb"))
      socket = connection
      try {connection.connect()} catch(e: Exception) {disconnect();throw e}
      Thread {
        try {val buffer = ByteArray(1024);while(connection.isConnected) {val count=connection.inputStream.read(buffer);if(count<0)break;receive(buffer.copyOf(count))}}
        catch(_: Exception) {if(socket===connection)receiveError="Printer disconnected. Reconnect before printing."}
      }.start()
      return
    }
    val ready=CountDownLatch(1)
    var failure: String? = null
    val callback=object: BluetoothGattCallback() {
      override fun onConnectionStateChange(g:BluetoothGatt,status:Int,newState:Int) {
        if(gatt!=null && gatt!==g) return
        if(status==BluetoothGatt.GATT_SUCCESS && newState==BluetoothProfile.STATE_CONNECTED) {g.discoverServices()}
        else if(newState==BluetoothProfile.STATE_DISCONNECTED || status!=BluetoothGatt.GATT_SUCCESS) {failure="Printer disconnected during connection ($status).";receiveError=failure;ready.countDown()}
      }
      override fun onServicesDiscovered(g:BluetoothGatt,status:Int) {
        if(status!=BluetoothGatt.GATT_SUCCESS) {failure="Printer services unavailable.";ready.countDown();return}
        for(service in g.services) {
          val write=service.characteristics.firstOrNull { it.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0 }
          val notify=service.characteristics.firstOrNull { it.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0 }
          if(write!=null && notify!=null) {
            writeCharacteristic=write
            if(!g.setCharacteristicNotification(notify,true)) {failure="Could not enable printer notifications.";ready.countDown();return}
            val descriptor=notify.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
            if(descriptor==null) {failure="Printer notifications have no descriptor.";ready.countDown();return}
            descriptor.value=BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            if(!g.writeDescriptor(descriptor)) {failure="Could not subscribe to the printer.";ready.countDown()}
            return
          }
        }
        failure="No printer data channel found. Try pairing and using Bluetooth classic.";ready.countDown()
      }
      override fun onDescriptorWrite(g:BluetoothGatt,d:BluetoothGattDescriptor,status:Int) {if(status!=BluetoothGatt.GATT_SUCCESS)failure="Printer notification setup failed ($status).";ready.countDown()}
      override fun onCharacteristicWrite(g:BluetoothGatt,c:BluetoothGattCharacteristic,status:Int) {writeStatus=status;writeLatch?.countDown()}
      override fun onCharacteristicChanged(g:BluetoothGatt,c:BluetoothGattCharacteristic) {if(Build.VERSION.SDK_INT<33)receive(c.value?:byteArrayOf())}
      override fun onCharacteristicChanged(g:BluetoothGatt,c:BluetoothGattCharacteristic,value:ByteArray) {receive(value)}
    }
    gatt=device.connectGatt(activity,false,callback,BluetoothDevice.TRANSPORT_LE)
    if(!ready.await(18,TimeUnit.SECONDS) || failure!=null || writeCharacteristic==null) {val message=failure?:"Bluetooth connection timed out.";disconnect();throw IllegalStateException(message)}
  }
  private fun receive(bytes:ByteArray) {
    if(incoming.size>=128) {receiveError="Printer response queue overflowed. Reconnect before printing.";return}
    incoming.add(bytes)
  }
  @Synchronized fun read():JSONArray {
    receiveError?.let {throw IllegalStateException(it)}
    val result=JSONArray()
    repeat(32) {val data=incoming.poll()?:return@repeat;data.forEach {result.put(it.toInt() and 255)}}
    return result
  }
  @Synchronized fun write(values:JSONArray) {
    check(values.length() in 1..2048) {"Invalid printer packet size."}
    val bytes=ByteArray(values.length()) {val n=values.getInt(it);check(n in 0..255);n.toByte()}
    socket?.let {it.outputStream.write(bytes);it.outputStream.flush();return}
    val connection=gatt?:throw IllegalStateException("Printer is disconnected.")
    val channel=writeCharacteristic?:throw IllegalStateException("Printer data channel is closed.")
    for(part in bytes.toList().chunked(20)) {
      val latch=CountDownLatch(1);writeLatch=latch;writeStatus=BluetoothGatt.GATT_FAILURE
      channel.writeType=BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;channel.value=part.toByteArray()
      check(connection.writeCharacteristic(channel)) {"Bluetooth write could not start."}
      check(latch.await(2,TimeUnit.SECONDS) && writeStatus==BluetoothGatt.GATT_SUCCESS) {"Bluetooth write failed. Check the last label before retrying."}
      writeLatch=null
    }
  }
}
