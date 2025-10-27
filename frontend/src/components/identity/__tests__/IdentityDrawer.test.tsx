import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IdentityDrawer } from '@/components/identity/IdentityDrawer';

const user = {
  uniqueID: '550e8400-e29b-41d4-a716-446655440000',
  clearance: 'SECRET',
  countryOfAffiliation: 'USA',
  acpCOI: ['FVEY']
};

describe('IdentityDrawer', () => {
  it('renders when open and hides when closed', () => {
    const { rerender } = render(<IdentityDrawer open={true} onClose={() => {}} user={user} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<IdentityDrawer open={false} onClose={() => {}} user={user} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('copies pseudonym on click', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<IdentityDrawer open={true} onClose={() => {}} user={user} />);

    const copyButton = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });
});



