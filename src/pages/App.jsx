import { useState } from 'react';
import { findCustomerVehicle, supabaseConfigured } from '../lib/supabase.js';

const steps = [
  { id: 'received', label: 'Checked in', caption: 'Your vehicle is with our team.' },
  { id: 'inspection', label: 'Inspection', caption: 'We are assessing what needs attention.' },
  { id: 'in_progress', label: 'Work in progress', caption: 'Approved work is underway.' },
  { id: 'ready', label: 'Ready for pickup', caption: 'Your vehicle is ready.' },
];
const statusLabels = Object.fromEntries(steps.map(({ id, label }) => [id, label]));

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
    <circle className="brand-mark-ring" cx="13.5" cy="13.5" r="9.5" />
    <path className="brand-mark-accent" d="m20.5 20.5 5 5" />
  </svg>;
}

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function App() {
  const [code, setCode] = useState('');
  const [vehicle, setVehicle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setVehicle(null);
    if (!code.trim()) return setError('Enter the status access code provided by your service team.');
    setBusy(true);
    try {
      const result = await findCustomerVehicle(code);
      if (!result) setError('We could not find a vehicle for that code. Check it and try again.');
      else setVehicle(result);
    } catch (lookupError) {
      setError(lookupError.message || 'We could not load the vehicle status. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const activeStep = Math.max(0, steps.findIndex(({ id }) => id === vehicle?.customer_status));
  const currentStatus = vehicle?.customer_status || 'received';
  const isReady = currentStatus === 'ready';

  return <div className="site-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="FlowDrive home"><BrandMark /> flowdrive</a>
      <a className="mechanic-link" href="/login.html">Mechanic sign in <span aria-hidden="true">↗</span></a>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> CUSTOMER VEHICLE UPDATES</p>
          <h1>Your car’s progress,<br /><em>in one clear place.</em></h1>
          <p className="hero-lede">A simple view of where your vehicle is in its service journey. Your service team handles the work; we keep you informed along the way.</p>
          <div className="hero-points"><span><b>✓</b> Current status</span><span><b>✓</b> Helpful updates</span><span><b>✓</b> Pickup estimate, when available</span></div>
        </div>
        <div className="lookup-card">
          <div className="lookup-card-heading"><div className="lookup-icon">⌕</div><div><p className="eyebrow">SECURE VEHICLE LOOKUP</p><h2>Check your car’s status</h2></div></div>
          <p className="lookup-copy">Enter the status access code your service team gave you.</p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="access-code">Status access code</label>
            <div className="input-wrap"><span aria-hidden="true">#</span><input id="access-code" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} placeholder="Enter your 32-character code" /></div>
            <button className="lookup-button" type="submit" disabled={busy || !supabaseConfigured}>{busy ? 'Checking status…' : 'View vehicle status'} <span aria-hidden="true">→</span></button>
          </form>
          {!supabaseConfigured && <p className="inline-error" role="status">Supabase connection is not configured. Please contact the dealership.</p>}
          {error && <p className="inline-error" role="status">{error}</p>}
          <p className="privacy-note"><span aria-hidden="true">⌑</span> Your access code only shows the vehicle shared with you.</p>
        </div>
      </section>

      {vehicle ? <section className="status-section" aria-live="polite">
        <div className="status-heading"><div><p className="eyebrow">YOUR VEHICLE</p><h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2><p className="vehicle-subtitle">{vehicle.stock_number ? `Stock ${vehicle.stock_number}` : 'Service update'} · Status updated {formatDate(vehicle.updated_at)}</p></div><span className={`status-pill ${isReady ? 'ready' : ''}`}><i />{statusLabels[currentStatus] || 'In service'}</span></div>
        <div className="status-panel">
          <div className="timeline">
            {steps.map((step, index) => <div className={`timeline-step ${index < activeStep ? 'complete' : ''} ${index === activeStep ? 'active' : ''}`} key={step.id}>
              <span className="step-marker">{index < activeStep ? '✓' : String(index + 1).padStart(2, '0')}</span><div><b>{step.label}</b><small>{index === activeStep ? step.caption : index < activeStep ? 'Complete' : 'Up next'}</small></div>
            </div>)}
          </div>
          <aside className="update-card"><p className="eyebrow">A NOTE FROM THE TEAM</p><h3>{isReady ? 'Your vehicle is ready.' : 'We’re keeping things moving.'}</h3><p>{vehicle.public_note || (isReady ? 'Please contact your service team to arrange pickup.' : 'Your service team will update this page as work progresses.')}</p>{vehicle.estimated_completion_at && !isReady && <div className="eta"><span>Estimated completion</span><b>{formatDate(vehicle.estimated_completion_at)}</b></div>}</aside>
        </div>
      </section> : <section className="preview-section">
        <div className="preview-heading"><p className="eyebrow">WHAT YOU’LL SEE</p><h2>Clear updates, without the guesswork.</h2></div>
        <div className="preview-grid"><article><span className="preview-icon green">✓</span><h3>Where things stand</h3><p>See the latest status shared by your service team.</p></article><article><span className="preview-icon violet">↗</span><h3>What happens next</h3><p>Follow each step from check-in through to pickup.</p></article><article><span className="preview-icon amber">◷</span><h3>Useful timing</h3><p>View an estimated completion time when one is available.</p></article></div>
      </section>}
    </main>

    <footer><a className="brand footer-brand" href="/"><BrandMark /> flowdrive</a><span>Updates are shared by your service team.</span><a href="/login.html">Employee access <span aria-hidden="true">→</span></a></footer>
  </div>;
}
