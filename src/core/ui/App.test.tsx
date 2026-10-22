import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('shows the app name and an empty state', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'BenchWork' })).toBeDefined();
    expect(screen.getByText('No vault open.')).toBeDefined();
  });
});
