import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import PersonalBest from '../components/PersonalBest';

describe('PersonalBest', () => {
  it('renders best login and best play streaks', () => {
    renderWithProviders(
      <PersonalBest bestLoginStreak={45} bestPlayStreak={22} />
    );
    expect(screen.getByText('Best Login')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('Best Play')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
  });
});
