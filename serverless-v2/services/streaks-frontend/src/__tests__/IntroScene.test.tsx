import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import IntroScene from '../components/IntroScene';

/**
 * BL-1: a light test that Skip advances from the intro to /login.
 * (jsdom doesn't actually play the <video>, so we drive the Skip path.)
 */
function renderIntro() {
  return render(
    <MemoryRouter initialEntries={['/intro']}>
      <Routes>
        <Route path="/intro" element={<IntroScene />} />
        <Route path="/login" element={<div>LOGIN ROUTE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('IntroScene (BL-1)', () => {
  it('renders a Skip button', () => {
    renderIntro();
    expect(screen.getByRole('button', { name: /Skip/i })).toBeInTheDocument();
  });

  it('Skip advances to /login', async () => {
    renderIntro();
    await userEvent.click(screen.getByRole('button', { name: /Skip/i }));
    expect(await screen.findByText('LOGIN ROUTE')).toBeInTheDocument();
  });
});
