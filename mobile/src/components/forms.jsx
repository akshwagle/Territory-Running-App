import { useState } from 'react';
import { formErrors, normalizeDisplayName, normalizeEmail } from '../auth/validation.js';
import { friendlyMessage } from '../auth/errors.js';

export function Notice({ children, error = false }) {
  return children ? <p className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>{children}</p> : null;
}

export function AuthForm({ kind, fields, submitLabel, busyLabel, onSubmit, onSuccess = () => {} }) {
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [success, setSuccess] = useState('');
  const [visible, setVisible] = useState({});
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    // Autofill/password managers can update native input values without a
    // React change event. Submit exactly what the user sees in the form.
    const data = new FormData(form);
    const values = Object.fromEntries(fields.map(field => [field.name, String(data.get(field.name) || '')]));
    const found = formErrors(kind, values); setErrors(found); setFailure(''); setSuccess('');
    if (Object.keys(found).length) return;
    setBusy(true);
    const body = Object.fromEntries(fields.map(field => [field.name, values[field.name] || '']));
    if ('email' in body) body.email = normalizeEmail(body.email);
    if ('displayName' in body) body.displayName = normalizeDisplayName(body.displayName);
    try { const result = await onSubmit(body); setSuccess(result?.message || 'Done.'); form.reset(); setVisible({}); onSuccess(result); }
    catch (error) { setFailure(friendlyMessage(error)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} noValidate aria-busy={busy}>
    <fieldset disabled={busy}>
      <legend className="sr-only">{submitLabel}</legend>
      {fields.map(field => <div className="field" key={field.name}>
        <label htmlFor={field.name}>{field.label}</label>
        <div className="input-row">
          <input id={field.name} name={field.name} required type={field.type === 'password' && visible[field.name] ? 'text' : field.type || 'text'}
            autoComplete={field.autoComplete} autoCapitalize={field.name === 'displayName' ? 'words' : 'none'} autoCorrect="off" spellCheck={false}
            inputMode={field.type === 'email' ? 'email' : undefined}
            aria-invalid={Boolean(errors[field.name])} aria-describedby={`${field.name}-help`} />
          {field.type === 'password' && <button className="reveal" type="button" aria-label={`${visible[field.name] ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`}
            aria-pressed={Boolean(visible[field.name])} onClick={() => setVisible({ ...visible, [field.name]: !visible[field.name] })}>{visible[field.name] ? 'Hide' : 'Show'}</button>}
        </div>
        <p id={`${field.name}-help`} className={errors[field.name] ? 'field-help error-text' : 'field-help'}>{errors[field.name] || field.help}</p>
      </div>)}
      <button className="primary" type="submit">{busy ? busyLabel || 'Working…' : submitLabel}</button>
    </fieldset>
    <Notice error>{failure}</Notice><Notice>{success}</Notice>
  </form>;
}

export const emailField = { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' };
export const passwordField = { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' };
export const newPasswordField = { name: 'newPassword', label: 'New password', type: 'password', autoComplete: 'new-password', help: 'Use 10–128 characters. Spaces are allowed.' };
