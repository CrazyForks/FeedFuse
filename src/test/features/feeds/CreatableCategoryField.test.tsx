import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import CreatableCategoryField from '../../../features/feeds/CreatableCategoryField';

const categoryOptions = [
  { id: 'cat-tech', name: '科技', expanded: true },
  { id: 'cat-design', name: '设计', expanded: true },
];

function renderField(initialValue = '') {
  function TestHarness() {
    const [value, setValue] = useState(initialValue);

    return (
      <div>
        <label id="category-input-label">分类</label>
        <CreatableCategoryField
          inputId="category-input"
          labelledBy="category-input-label"
          value={value}
          options={categoryOptions}
          onChange={setValue}
        />
      </div>
    );
  }

  render(<TestHarness />);
  return screen.getByLabelText('分类');
}

describe('CreatableCategoryField', () => {
  it('does not open suggestions on focus alone', () => {
    const categoryInput = renderField();

    categoryInput.focus();

    expect(categoryInput).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: '分类建议' })).not.toBeInTheDocument();
  });

  it('opens suggestions from the expand button', async () => {
    const categoryInput = renderField();

    fireEvent.click(screen.getByRole('button', { name: '展开分类选项' }));

    expect(categoryInput).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('listbox', { name: '分类建议' })).toBeInTheDocument();
  });

  it('prevents form submit Enter when user types a new category', () => {
    const categoryInput = renderField();

    fireEvent.change(categoryInput, {
      target: { value: '新分类' },
    });

    const handled = fireEvent.keyDown(categoryInput, {
      key: 'Enter',
      code: 'Enter',
      charCode: 13,
    });

    expect(handled).toBe(false);
    expect(categoryInput).toHaveValue('新分类');
    expect(categoryInput).toHaveAttribute('aria-expanded', 'false');
  });
});
