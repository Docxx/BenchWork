import { createRoot } from 'react-dom/client';
import { nativeLabelBluetooth } from '../core/platform/labelBluetooth';
import { createPlatform } from '../core/platform';
import { PhoneShell } from './PhoneShell';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './phone.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing Label Studio root.');
createRoot(root).render(
  <PhoneShell platform={createPlatform()} transport={nativeLabelBluetooth()} />,
);
