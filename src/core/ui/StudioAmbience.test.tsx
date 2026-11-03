import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { AppStoreProvider } from './AppStoreContext';
import { StudioAmbience } from './StudioAmbience';

it('starts ambient audio only on demand and resets to paused when the source changes', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const store = createAppStore(new MemoryAdapter());
  const source = 'data:audio/mpeg;base64,YQ==';
  await store.getState().setAppearance({ ambientSound: source });
  const view = render(
    <AppStoreProvider store={store}>
      <StudioAmbience />
    </AppStoreProvider>,
  );
  expect(play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start ambience' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Pause ambience' })).not.toBeNull();
  });
  expect(play).toHaveBeenCalledTimes(1);
  await act(async () => {
    await store.getState().setAppearance({ ambientSound: 'data:audio/mpeg;base64,Yg==' });
  });
  expect(screen.getByRole('button', { name: 'Start ambience' })).not.toBeNull();
  expect(pause).toHaveBeenCalled();
  expect(play).toHaveBeenCalledTimes(1);
  view.unmount();
});
