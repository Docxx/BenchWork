//! Device-local label-printer transport. No print commands or firmware operations.
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterDevice {
    pub id: String,
    pub name: String,
    pub transport: String,
}

#[cfg(windows)]
mod desktop {
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::{mpsc, Arc, Mutex, OnceLock};
    use std::time::Duration;
    use windows::core::HSTRING;
    use windows::Devices::Bluetooth::Advertisement::{
        BluetoothLEAdvertisementReceivedEventArgs, BluetoothLEAdvertisementWatcher,
        BluetoothLEScanningMode,
    };
    use windows::Devices::Bluetooth::GenericAttributeProfile::{
        GattCharacteristic, GattCharacteristicProperties,
        GattClientCharacteristicConfigurationDescriptorValue, GattCommunicationStatus,
        GattDeviceService, GattValueChangedEventArgs, GattWriteOption,
    };
    use windows::Devices::Bluetooth::Rfcomm::RfcommServiceId;
    use windows::Devices::Bluetooth::{BluetoothCacheMode, BluetoothDevice, BluetoothLEDevice};
    use windows::Devices::Enumeration::DeviceInformation;
    use windows::Foundation::TypedEventHandler;
    use windows::Networking::Sockets::StreamSocket;
    use windows::Storage::Streams::{DataReader, DataWriter, InputStreamOptions};
    fn err(e: impl std::fmt::Display) -> String {
        e.to_string()
    }
    fn init() {
        thread_local! { static READY: std::sync::Once = const { std::sync::Once::new() }; }
        READY.with(|ready| {
            ready.call_once(|| {
                let _ = unsafe {
                    windows::Win32::System::WinRT::RoInitialize(
                        windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
                    )
                };
            })
        });
    }
    fn printer_name(name: &str) -> bool {
        let n = name.to_ascii_uppercase();
        n.starts_with("B3S") || n.starts_with("NIIMBOT")
    }
    enum Link {
        Ble {
            device: BluetoothLEDevice,
            services: Vec<GattDeviceService>,
            write: GattCharacteristic,
            notify: GattCharacteristic,
            token: i64,
        },
        Classic {
            device: BluetoothDevice,
            socket: StreamSocket,
            writer: DataWriter,
        },
    }
    struct Connection {
        link: Link,
        incoming: mpsc::Receiver<Vec<u8>>,
    }
    static CONNECTION: OnceLock<Mutex<Option<Connection>>> = OnceLock::new();
    fn connection() -> &'static Mutex<Option<Connection>> {
        CONNECTION.get_or_init(|| Mutex::new(None))
    }
    pub fn scan() -> Result<Vec<PrinterDevice>, String> {
        init();
        let found = Arc::new(Mutex::new(BTreeMap::<String, PrinterDevice>::new()));
        let watcher = BluetoothLEAdvertisementWatcher::new().map_err(err)?;
        watcher
            .SetScanningMode(BluetoothLEScanningMode::Active)
            .map_err(err)?;
        let devices = found.clone();
        let token = watcher
            .Received(&TypedEventHandler::new(
                move |_, event: windows::core::Ref<BluetoothLEAdvertisementReceivedEventArgs>| {
                    if let Some(event) = event.as_ref() {
                        let name = event.Advertisement()?.LocalName()?.to_string();
                        if printer_name(&name) {
                            let id = format!("ble:{}", event.BluetoothAddress()?);
                            if let Ok(mut out) = devices.lock() {
                                out.insert(
                                    id.clone(),
                                    PrinterDevice {
                                        id,
                                        name,
                                        transport: "Bluetooth LE".into(),
                                    },
                                );
                            }
                        }
                    }
                    Ok(())
                },
            ))
            .map_err(err)?;
        watcher.Start().map_err(err)?;
        std::thread::sleep(Duration::from_secs(5));
        watcher.Stop().map_err(err)?;
        let _ = watcher.RemoveReceived(token);
        let paired = DeviceInformation::FindAllAsyncAqsFilter(
            &BluetoothDevice::GetDeviceSelectorFromPairingState(true).map_err(err)?,
        )
        .map_err(err)?
        .join()
        .map_err(err)?;
        for d in paired {
            let name = d.Name().map_err(err)?.to_string();
            if printer_name(&name) {
                let id = format!("classic:{}", d.Id().map_err(err)?);
                found.lock().map_err(err)?.insert(
                    id.clone(),
                    PrinterDevice {
                        id,
                        name,
                        transport: "Bluetooth classic (paired)".into(),
                    },
                );
            }
        }
        let out = found.lock().map_err(err)?.values().cloned().collect();
        Ok(out)
    }
    pub fn disconnect() -> Result<(), String> {
        init();
        let old = connection().lock().map_err(err)?.take();
        if let Some(c) = old {
            match c.link {
                Link::Ble {
                    device,
                    services,
                    notify,
                    token,
                    ..
                } => {
                    let _ = notify.RemoveValueChanged(token);
                    for s in services {
                        let _ = s.Close();
                    }
                    let _ = device.Close();
                }
                Link::Classic { device, socket, .. } => {
                    let _ = socket.Close();
                    let _ = device.Close();
                }
            }
        }
        Ok(())
    }
    pub fn connect(id: &str) -> Result<(), String> {
        init();
        disconnect()?;
        let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(128);
        let link = if let Some(address) = id.strip_prefix("ble:") {
            let device =
                BluetoothLEDevice::FromBluetoothAddressAsync(address.parse::<u64>().map_err(err)?)
                    .map_err(err)?
                    .join()
                    .map_err(err)?;
            if !printer_name(&device.Name().map_err(err)?.to_string()) {
                let _ = device.Close();
                return Err("Choose a NIIMBOT B3S printer.".into());
            }
            let result = device
                .GetGattServicesWithCacheModeAsync(BluetoothCacheMode::Uncached)
                .map_err(err)?
                .join()
                .map_err(err)?;
            if result.Status().map_err(err)? != GattCommunicationStatus::Success {
                return Err(
                    "Printer services unavailable. Close the NIIMBOT app and reconnect.".into(),
                );
            }
            let mut services = Vec::new();
            let mut chosen = None;
            for service in result.Services().map_err(err)? {
                let chars = service
                    .GetCharacteristicsWithCacheModeAsync(BluetoothCacheMode::Uncached)
                    .map_err(err)?
                    .join()
                    .map_err(err)?;
                if chars.Status().map_err(err)? == GattCommunicationStatus::Success {
                    let mut write = None;
                    let mut notify = None;
                    for c in chars.Characteristics().map_err(err)? {
                        let p = c.CharacteristicProperties().map_err(err)?;
                        if p.contains(GattCharacteristicProperties::WriteWithoutResponse) {
                            write = Some(c.clone());
                        }
                        if p.contains(GattCharacteristicProperties::Notify) {
                            notify = Some(c);
                        }
                    }
                    if let (Some(w), Some(n)) = (write, notify) {
                        chosen = Some((w, n));
                    }
                }
                services.push(service);
            }
            let (write, notify) = chosen.ok_or(
                "No printer data channel found. This unit may require Bluetooth classic pairing.",
            )?;
            let token = notify
                .ValueChanged(&TypedEventHandler::new(
                    move |_, e: windows::core::Ref<GattValueChangedEventArgs>| {
                        if let Some(e) = e.as_ref() {
                            let reader = DataReader::FromBuffer(&e.CharacteristicValue()?)?;
                            let mut data = vec![0; reader.UnconsumedBufferLength()? as usize];
                            reader.ReadBytes(&mut data)?;
                            let _ = tx.try_send(data);
                        }
                        Ok(())
                    },
                ))
                .map_err(err)?;
            let status = notify
                .WriteClientCharacteristicConfigurationDescriptorAsync(
                    GattClientCharacteristicConfigurationDescriptorValue::Notify,
                )
                .map_err(err)?
                .join()
                .map_err(err)?;
            if status != GattCommunicationStatus::Success {
                return Err("Printer notifications could not be enabled.".into());
            }
            Link::Ble {
                device,
                services,
                write,
                notify,
                token,
            }
        } else if let Some(device_id) = id.strip_prefix("classic:") {
            let device = BluetoothDevice::FromIdAsync(&HSTRING::from(device_id))
                .map_err(err)?
                .join()
                .map_err(err)?;
            if !printer_name(&device.Name().map_err(err)?.to_string()) {
                let _ = device.Close();
                return Err("Choose a NIIMBOT B3S printer.".into());
            }
            let result = device
                .GetRfcommServicesForIdAsync(&RfcommServiceId::SerialPort().map_err(err)?)
                .map_err(err)?
                .join()
                .map_err(err)?;
            let service = result.Services().map_err(err)?.GetAt(0).map_err(err)?;
            let socket = StreamSocket::new().map_err(err)?;
            socket
                .ConnectAsync(
                    &service.ConnectionHostName().map_err(err)?,
                    &service.ConnectionServiceName().map_err(err)?,
                )
                .map_err(err)?
                .join()
                .map_err(err)?;
            let reader =
                DataReader::CreateDataReader(&socket.InputStream().map_err(err)?).map_err(err)?;
            reader
                .SetInputStreamOptions(InputStreamOptions::Partial)
                .map_err(err)?;
            std::thread::spawn(move || {
                init();
                loop {
                    let Ok(n) = reader.LoadAsync(1024).and_then(|op| op.join()) else {
                        break;
                    };
                    if n == 0 {
                        break;
                    }
                    let mut data = vec![0; n as usize];
                    if reader.ReadBytes(&mut data).is_err() || tx.send(data).is_err() {
                        break;
                    }
                }
            });
            let writer =
                DataWriter::CreateDataWriter(&socket.OutputStream().map_err(err)?).map_err(err)?;
            Link::Classic {
                device,
                socket,
                writer,
            }
        } else {
            return Err("Choose a discovered printer.".into());
        };
        *connection().lock().map_err(err)? = Some(Connection { link, incoming: rx });
        Ok(())
    }
    pub fn write(bytes: &[u8]) -> Result<(), String> {
        init();
        if bytes.is_empty() || bytes.len() > 2048 {
            return Err("Invalid printer packet size.".into());
        }
        let mut state = connection().lock().map_err(err)?;
        let c = state.as_mut().ok_or("Printer is disconnected.")?;
        match &mut c.link {
            Link::Ble { write, .. } => {
                for part in bytes.chunks(20) {
                    let data = DataWriter::new().map_err(err)?;
                    data.WriteBytes(part).map_err(err)?;
                    let status = write
                        .WriteValueWithOptionAsync(
                            &data.DetachBuffer().map_err(err)?,
                            GattWriteOption::WriteWithoutResponse,
                        )
                        .map_err(err)?
                        .join()
                        .map_err(err)?;
                    if status != GattCommunicationStatus::Success {
                        return Err("Bluetooth write failed.".into());
                    }
                }
            }
            Link::Classic { writer, .. } => {
                writer.WriteBytes(bytes).map_err(err)?;
                writer.StoreAsync().map_err(err)?.join().map_err(err)?;
            }
        }
        Ok(())
    }
    pub fn read() -> Result<Vec<u8>, String> {
        let state = connection().lock().map_err(err)?;
        let c = state.as_ref().ok_or("Printer is disconnected.")?;
        let mut out = Vec::new();
        for data in c.incoming.try_iter().take(32) {
            out.extend(data);
        }
        Ok(out)
    }
}
#[cfg(windows)]
pub use desktop::{connect, disconnect, read, scan, write};
#[cfg(not(windows))]
pub fn scan() -> Result<Vec<PrinterDevice>, String> {
    Err("Use the Android Bluetooth adapter on this device.".into())
}
#[cfg(not(windows))]
pub fn connect(_: &str) -> Result<(), String> {
    Err("Bluetooth is unavailable on this platform.".into())
}
#[cfg(not(windows))]
pub fn disconnect() -> Result<(), String> {
    Ok(())
}
#[cfg(not(windows))]
pub fn read() -> Result<Vec<u8>, String> {
    Err("Bluetooth is unavailable on this platform.".into())
}
#[cfg(not(windows))]
pub fn write(_: &[u8]) -> Result<(), String> {
    Err("Bluetooth is unavailable on this platform.".into())
}
