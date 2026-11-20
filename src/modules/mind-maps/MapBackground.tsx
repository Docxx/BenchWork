export function MapBackground({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <span className="map-background-control">
      <label>
        Background{' '}
        <input
          aria-label="Map background colour"
          type="color"
          disabled={disabled}
          value={value ?? '#ffffff'}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="quiet"
        disabled={disabled || value === null}
        onClick={() => {
          onChange(null);
        }}
      >
        Use theme
      </button>
    </span>
  );
}
