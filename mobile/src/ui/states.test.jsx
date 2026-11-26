import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { EmptyState, RunStats, Section, Skeleton, StatGrid, StatTile } from './index.jsx';
import { WorkoutPage } from '../pages/workout-pages.jsx';

it('Section groups rows under a labelled heading; plain sections drop the surface and show an aside', () => {
  const { container } = render(<><Section title="Account"><p>Row</p></Section><Section plain title="This week" aside="4.20 km in 2 runs"><p>Chart</p></Section></>);
  const [list, plain] = container.querySelectorAll('section.ui-section');
  expect(within(list).getByRole('heading', { level: 2, name: 'Account' })).toBeVisible();
  expect(list.querySelector('.ui-section-body')).toHaveTextContent('Row');
  expect(plain).toHaveClass('ui-section--plain');
  expect(within(plain).getByRole('heading', { level: 2 })).toHaveTextContent('This week4.20 km in 2 runs');
});

it('EmptyState compact keeps the title and text but no illustration; default shows one', () => {
  const { container, rerender } = render(<EmptyState compact title="No runs this week">Runs show up here.</EmptyState>);
  expect(screen.getByRole('heading', { name: 'No runs this week' })).toBeVisible();
  expect(container.querySelector('svg')).toBeNull();
  rerender(<EmptyState title="No runs yet">Runs show up here.</EmptyState>);
  expect(container.querySelector('.ui-empty svg')).not.toBeNull();
});

it('RunStats live leads with distance; compact keeps the same order in three columns', () => {
  const { container, rerender } = render(<RunStats distance="5.00 km" time="25:00" pace="5:00 /km"/>);
  expect([...container.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Distance', 'Time', 'Pace']);
  expect(container.querySelector('dl')).not.toHaveClass('ui-run-stats--compact');
  rerender(<RunStats variant="compact" distance="5.00 km" time="25:00" pace="5:00 /km"/>);
  expect(container.querySelector('dl')).toHaveClass('ui-run-stats--compact');
  expect(screen.getByText('5.00 km').tagName).toBe('DD');
});

it('StatTile reads value and unit with a space for screen readers; stat skeleton is announced', () => {
  render(<><StatGrid><StatTile label="Distance" value="20.00" unit="km"/></StatGrid><Skeleton shape="stat" lines={2} label="Loading totals…"/></>);
  expect(screen.getByText('20.00').closest('dd')).toHaveTextContent(/^20\.00 km$/);
  expect(screen.getByRole('status')).toHaveTextContent('Loading totals…');
});

it('Workout has one primary start action, list rows for next places, and a recording explainer sheet', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><WorkoutPage/></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Start run' })).toHaveAttribute('href', '/run');
  expect(document.querySelectorAll('.ui-button--primary')).toHaveLength(1);
  for (const [name, href] of [[/Territory map/, '/map'], [/Stats and badges/, '/stats'], [/Run history/, '/run/history']]) expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  await user.click(screen.getByRole('button', { name: 'How recording works' }));
  expect(screen.getByRole('dialog', { name: 'How recording works' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Got it' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
