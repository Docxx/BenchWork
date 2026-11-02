import { createRoot } from 'react-dom/client';
import { LabelStudio } from '../core/labels/LabelStudio';
import { localLabelWorkspace } from '../core/labels/workspace';
import { nativeLabelBluetooth } from '../core/platform/labelBluetooth';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './phone.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing Label Studio root.');
createRoot(root).render(
  <LabelStudio workspace={localLabelWorkspace()} transport={nativeLabelBluetooth()} standalone />,
);
