import { useRef, useState } from 'react';
import { formErrors, normalizeDisplayName, normalizeEmail } from '../auth/validation.js';
import { friendlyMessage } from '../auth/errors.js';
import { Button, InlineNotice, Success, TextField } from '../ui/index.jsx';

export function Notice({ children, error = false }) {
  return error ? <InlineNotice error>{children}</InlineNotice> : <Success>{children}</Success>;
}

export function AuthForm({ kind, fields, submitLabel, busyLabel, onSubmit, onSuccess = () => {} }) {
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [success, setSuccess] = useState('');
  const submitting = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    // Autofill/password managers can update native input values without a
    // React change event. Submit exactly what the user sees in the form.
    const data = new FormData(form);
    const values = Object.fromEntries(fields.map(field => [field.name, String(data.get(field.name) || '')]));
    const found = formErrors(kind, values); setErrors(found); setFailure(''); setSuccess('');
    if (Object.keys(found).length) { form.elements.namedItem(Object.keys(found)[0])?.focus(); return; }
    submitting.current = true; setBusy(true);
    const body = Object.fromEntries(fields.map(field => [field.name, values[field.name] || '']));
    if ('email' in body) body.email = normalizeEmail(body.email);
    if ('displayName' in body) body.displayName = normalizeDisplayName(body.displayName);
    try { const result = await onSubmit(body); setSuccess(result?.message || 'Done.'); form.reset(); onSuccess(result); }
    catch (error) { setFailure(friendlyMessage(error)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} noValidate aria-busy={busy}>
    <fieldset disabled={busy}>
      <legend className="sr-only">{submitLabel}</legend>
      {fields.map(field => <TextField key={field.name} id={field.name} name={field.name} label={field.label} required type={field.type || 'text'}
        autoComplete={field.autoComplete} autoCapitalize={field.name === 'displayName' ? 'words' : 'none'} autoCorrect="off" spellCheck={false}
        inputMode={field.type === 'email' ? 'email' : undefined} error={errors[field.name]} help={field.help} enterKeyHint={field === fields.at(-1) ? 'go' : 'next'} />)}
      <Button type="submit" loading={busy}>{busy ? busyLabel || 'Working…' : submitLabel}</Button>
    </fieldset>
    <Notice error>{failure}</Notice><Notice>{success}</Notice>
  </form>;
}

export const emailField = { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' };
export const passwordField = { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' };
export const newPasswordField = { name: 'newPassword', label: 'New password', type: 'password', autoComplete: 'new-password', help: 'Use 10–128 characters. Spaces are allowed.' };
