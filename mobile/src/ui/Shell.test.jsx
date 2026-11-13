import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { MemoryRouter, Link } from 'react-router';
import { useEffect } from 'react';
import { Shell } from './Shell.jsx';
import { Dialog } from './index.jsx';

it('UI-05 native back exits at a tab root and closes overlays before exiting', async () => {
  const exit = vi.fn(); let back;
  const watch = async ({ onBack }) => { back = onBack; return () => {}; };
  const view = render(<MemoryRouter initialEntries={['/home']}><Shell user={{id:'one'}} nativeBack={watch} exit={exit} renderRoutes={() => <h1>Home content</h1>}/></MemoryRouter>);
  await act(async () => {}); act(() => back()); expect(exit).toHaveBeenCalledOnce();
  const close = vi.fn(), overlay = render(<Dialog title="Discard" onClose={close}>Choose</Dialog>);
  act(() => back()); expect(close).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce(); overlay.unmount(); view.unmount();
});
it('UI-05 a cold nested screen goes to its parent rather than exiting or redirect-looping', async () => {
  let back; const exit = vi.fn(), watch = async ({ onBack }) => { back = onBack; return () => {}; };
  render(<MemoryRouter initialEntries={['/you/privacy']}><Shell user={{id:'one'}} nativeBack={watch} exit={exit} renderRoutes={route => <h1>{route.pathname}</h1>}/></MemoryRouter>);
  await act(async () => {}); act(() => back()); expect(screen.getByRole('heading', {name:'/you'})).toBeVisible(); expect(exit).not.toHaveBeenCalled();
});
it('tab switches preserve unsaved values and scroll in memory; another account gets a fresh page', async () => {
  const user = userEvent.setup(), watch = async () => () => {};
  const content = route => route.pathname === '/you' ? <><h1>Edit profile</h1><input aria-label="Draft bio" defaultValue=""/></> : <h1>Home content</h1>;
  const tree = owner => <MemoryRouter initialEntries={['/you']}><Shell user={{ id: owner }} nativeBack={watch} renderRoutes={content}/></MemoryRouter>;
  const view = render(tree('one')); await user.type(screen.getByLabelText('Draft bio'), 'Unsaved note');
  const main = document.querySelector('main'); main.scrollTop = 180; fireEvent.scroll(main);
  await user.click(screen.getByRole('link', {name:'Home'})); await user.click(screen.getByRole('link', {name:'You'}));
  expect(screen.getByLabelText('Draft bio')).toHaveValue('Unsaved note'); expect(main.scrollTop).toBe(180);
  view.rerender(tree('two')); expect(screen.getByLabelText('Draft bio')).toHaveValue('');
  expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(1);
});

it('UI-05 rapid tab taps paint exactly one page before any animation can finish', () => {
  const watch = async () => () => {};
  render(<MemoryRouter initialEntries={['/settings']}><Shell user={{id:'one'}} nativeBack={watch} renderRoutes={route => <h1>{route.pathname}</h1>}/></MemoryRouter>);
  for (const label of ['You','Settings','You','Home','Settings','Home','You','Settings','You']) {
    fireEvent.click(screen.getByRole('link',{name:label}));
    const painted = document.querySelectorAll('main > .route-page:not([hidden])');
    expect(painted).toHaveLength(1);
    expect(painted[0].dataset.route).toBe(label==='You'?'/you':label==='Home'?'/home':'/settings');
    expect(document.activeElement).toBe(painted[0].querySelector('h1'));
    expect(document.querySelector('.is-leaving')).toBeNull();
  }
});
it('public footer stays mounted across tab changes, preventing repeated loading flashes', async () => {
  const loaded=vi.fn(), watch=async()=>()=>{};
  function Footer(){ useEffect(()=>{loaded();},[]);return <p>Release info</p>; }
  render(<MemoryRouter initialEntries={['/settings']}><Shell user={{id:'one'}} nativeBack={watch} footer={<Footer/>} renderRoutes={route=><h1>{route.pathname}</h1>}/></MemoryRouter>);
  await act(async()=>{});
  fireEvent.click(screen.getByRole('link',{name:'You'}));fireEvent.click(screen.getByRole('link',{name:'Settings'}));
  expect(loaded).toHaveBeenCalledOnce();
});

it('UI-05 Back reverses the transition even when the restored root was originally opened by a tab', async()=>{
  let back;const watch=async({onBack})=>{back=onBack;return()=>{};};
  render(<MemoryRouter initialEntries={['/home']}><Shell user={{id:'one'}} nativeBack={watch} renderRoutes={route=><><h1>{route.pathname}</h1>{route.pathname==='/you'&&<Link to="/you/privacy">Privacy</Link>}</>}/></MemoryRouter>);
  await act(async()=>{});fireEvent.click(screen.getByRole('link',{name:'You'}));fireEvent.click(screen.getByRole('link',{name:'Privacy'}));
  act(()=>back());const active=document.querySelector('main > .route-page:not([hidden])');
  expect(active.dataset.route).toBe('/you');expect(active.dataset.direction).toBe('back');
});
