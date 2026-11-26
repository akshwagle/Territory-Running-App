import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { AuthContext } from '../auth/context.jsx';
import { FirstRunIntro } from './FirstRunIntro.jsx';
import { UIProvider } from './index.jsx';
const show = user => { const snap = { status: "signedIn", user }; return render(<AuthContext.Provider value={{ getSnapshot: () => snap, subscribe: () => () => {} }}><UIProvider><FirstRunIntro/></UIProvider></AuthContext.Provider>); };
beforeEach(() => window.localStorage.clear());
it('explains location and notifications once per account', async () => {
  show({ id: 'u1' }); const user = userEvent.setup();
  expect(screen.getByRole('dialog')).toHaveTextContent('Location');
  await user.click(screen.getByRole('button', { name: 'Got it' })); expect(screen.queryByRole('dialog')).toBeNull();
  render(<div/>); show({ id: 'u1' }); expect(screen.queryByRole('dialog')).toBeNull();
});
it('stays hidden when signed out', () => { show(null); expect(screen.queryByRole('dialog')).toBeNull(); });
