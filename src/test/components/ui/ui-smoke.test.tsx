import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { Switch } from '../../../components/ui/switch';

describe('ui smoke', () => {
  it('renders Button', () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('renders Dialog when open', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>Hello</DialogTitle>
          <DialogDescription>World</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });

  it('renders Switch and can be toggled', () => {
    render(<Switch aria-label="test-switch" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'test-switch' })).toBeInTheDocument();
  });
});
