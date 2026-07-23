import { useEffect, useState } from 'react';
import { buildCustomProfile, type CustomProfileInput } from '../api';
import type { WorkloadProfile } from '../profileTypes';

export type { CustomProfileInput, WorkloadProfile };

type CustomTelemetryModalProps = {
  open: boolean;
  initial?: CustomProfileInput | null;
  onClose: () => void;
  onApply: (profile: WorkloadProfile, input: CustomProfileInput) => void;
};

const DEFAULT_INPUT: CustomProfileInput = {
  readPercent: 80,
  writePercent: 20,
  peakRpm: 10000,
  growthRate: '10GB/month',
  readPreference: 'primary',
  writeConcernW: 1,
  writeConcernJournal: false,
  compression: 'snappy',
};

export function CustomTelemetryModal({ open, initial, onClose, onApply }: CustomTelemetryModalProps) {
  const [form, setForm] = useState<CustomProfileInput>(initial ?? DEFAULT_INPUT);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(initial ?? DEFAULT_INPUT);
      setError('');
    }
  }, [open, initial]);

  if (!open) return null;

  const setReadPercent = (readPercent: number) => {
    const clamped = Math.max(0, Math.min(100, readPercent));
    setForm((prev) => ({ ...prev, readPercent: clamped, writePercent: 100 - clamped }));
  };

  const handleApply = async () => {
    setError('');
    try {
      const profile = await buildCustomProfile(form);
      onApply(profile, form);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="custom-telemetry-title">
      <div className="pipeline-modal panel custom-telemetry-modal">
        <header className="pipeline-modal__header">
          <h2 id="custom-telemetry-title">Custom workload telemetry</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close custom workload dialog">
            ✕
          </button>
        </header>

        <p className="pipeline-hint" style={{ marginTop: 0 }}>
          Override preset profiles with your read/write mix, throughput, growth rate, and MongoDB driver tuning.
          See{' '}
          <a href="https://www.mongodb.com/docs/manual/core/read-preference/" target="_blank" rel="noreferrer">
            read preference
          </a>{' '}
          and{' '}
          <a href="https://www.mongodb.com/docs/manual/core/replica-set-write-concern/" target="_blank" rel="noreferrer">
            write concern
          </a>{' '}
          docs.
        </p>

        <div className="custom-telemetry-form">
          <label>
            Read percent
            <input
              type="number"
              min={0}
              max={100}
              value={form.readPercent}
              onChange={(e) => setReadPercent(Number(e.target.value))}
            />
          </label>
          <label>
            Write percent
            <input
              type="number"
              min={0}
              max={100}
              value={form.writePercent}
              onChange={(e) => setReadPercent(100 - Number(e.target.value))}
            />
          </label>
          <label>
            Peak RPM
            <input
              type="number"
              min={1}
              value={form.peakRpm}
              onChange={(e) => setForm((prev) => ({ ...prev, peakRpm: Number(e.target.value) }))}
            />
          </label>
          <label>
            Growth rate
            <input
              type="text"
              value={form.growthRate}
              placeholder="10GB/month"
              onChange={(e) => setForm((prev) => ({ ...prev, growthRate: e.target.value }))}
            />
          </label>
          <label>
            Read preference
            <select
              value={form.readPreference}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  readPreference: e.target.value as CustomProfileInput['readPreference'],
                }))
              }
            >
              <option value="primary">primary</option>
              <option value="primaryPreferred">primaryPreferred</option>
              <option value="secondary">secondary</option>
              <option value="secondaryPreferred">secondaryPreferred</option>
              <option value="nearest">nearest</option>
            </select>
          </label>
          <label>
            Write concern (w)
            <select
              value={String(form.writeConcernW)}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  writeConcernW: e.target.value === 'majority' ? 'majority' : Number(e.target.value),
                }))
              }
            >
              <option value="1">1 (primary ack)</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="majority">majority</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.writeConcernJournal}
              onChange={(e) => setForm((prev) => ({ ...prev, writeConcernJournal: e.target.checked }))}
            />
            Journal (j: true)
          </label>
          <label>
            Wire compression
            <select
              value={form.compression}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  compression: e.target.value as CustomProfileInput['compression'],
                }))
              }
            >
              <option value="snappy">Snappy</option>
              <option value="zstd">Zstandard (zstd)</option>
              <option value="zlib">Zlib</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>

        {error ? <p className="pipeline-error">{error}</p> : null}

        <footer className="pipeline-modal__footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void handleApply()}>
            Apply profile
          </button>
        </footer>
      </div>
    </div>
  );
}
