// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FormModal, { type Field } from '../../client/components/FormModal';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const allFields: Field[] = [
  { name: 'name', label: 'Name', type: 'text', required: true },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'date', label: 'Date', type: 'date' },
  { name: 'status', label: 'Status', type: 'select', options: [{ value: 'New', label: 'New' }, { value: 'Lost', label: 'Lost' }] },
  { name: 'tags', label: 'Tags', type: 'multiselect', options: [{ value: 'a', label: 'Tag A' }, { value: 'b', label: 'Tag B' }] },
  { name: 'notes', label: 'Notes', type: 'textarea' },
  { name: 'active', label: 'Active', type: 'checkbox' },
];

const submitBtn = (label = 'Save') => screen.getByRole('button', { name: label });

describe('FormModal — field types', () => {
  it('renders each field type with the right control', () => {
    render(<FormModal title="T" fields={allFields} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText('Price') as HTMLInputElement).type).toBe('number');
    expect((screen.getByLabelText('Email') as HTMLInputElement).type).toBe('email');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).type).toBe('tel');
    expect((screen.getByLabelText('Date') as HTMLInputElement).type).toBe('date');
    expect(screen.getByLabelText('Status').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
    expect((screen.getByLabelText('Active') as HTMLInputElement).type).toBe('checkbox');
    expect(screen.getByText('Tag A')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'T' })).toBeTruthy();
  });

  it('submits all field values with correct shapes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<FormModal title="T" fields={allFields} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ravi' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Lost' } });
    fireEvent.click(screen.getByText('Tag B'));
    fireEvent.click(screen.getByText('Tag A'));
    fireEvent.click(screen.getByText('Tag B')); // toggle off
    fireEvent.click(screen.getByLabelText('Active'));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hi' } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ravi', price: 12.5, email: '', phone: '', date: '', status: 'Lost', tags: ['a'], notes: 'hi', active: true,
    });
  });

  it('prefills from initial values, keeping 0 and false', () => {
    render(<FormModal title="T" fields={allFields} initial={{ name: 'X', price: 0, active: true, tags: ['b'] }} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('X');
    expect((screen.getByLabelText('Price') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Active') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Tag B').className).toContain('on');
  });

  it('uses custom submitLabel', () => {
    render(<FormModal title="T" fields={[]} submitLabel="Create" onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(submitBtn('Create')).toBeTruthy();
  });
});

describe('FormModal — required validation', () => {
  it('empty required field shows inline error and does not call onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<FormModal title="T" fields={allFields} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(submitBtn());
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('*', { exact: false })).toBeTruthy();
  });

  it('error clears after filling the field and resubmitting', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormModal title="T" fields={allFields} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(submitBtn());
    await screen.findByText('Name is required');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'A' } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText('Name is required')).toBeNull();
  });

  it('reports every missing required field at once', async () => {
    const fields: Field[] = [
      { name: 'a', label: 'A', type: 'text', required: true },
      { name: 's', label: 'S', type: 'select', required: true, options: [{ value: 'x', label: 'x' }] },
      { name: 'm', label: 'M', type: 'multiselect', required: true, options: [{ value: 'x', label: 'X' }] },
      { name: 'n', label: 'N', type: 'number', required: true },
    ];
    render(<FormModal title="T" fields={fields} onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(submitBtn());
    for (const l of ['A', 'S', 'M', 'N']) expect(await screen.findByText(`${l} is required`)).toBeTruthy();
  });

  it('required number field accepts "0"', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormModal title="T" fields={[{ name: 'n', label: 'N', type: 'number', required: true }]} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^N/), { target: { value: '0' } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ n: 0 }));
    expect(screen.queryByText('N is required')).toBeNull();
  });

  it('whitespace-only value in a required text field is rejected', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormModal title="T" fields={[{ name: 'a', label: 'A', type: 'text', required: true }]} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^A/), { target: { value: '   ' } });
    fireEvent.click(submitBtn());
    expect(await screen.findByText('A is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('FormModal — number conversion', () => {
  const numField: Field[] = [{ name: 'n', label: 'N', type: 'number' }];
  const submitWith = async (value: string) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormModal title="T" fields={numField} onSubmit={onSubmit} onClose={vi.fn()} />);
    if (value !== '') fireEvent.change(screen.getByLabelText('N'), { target: { value } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    return onSubmit.mock.calls[0][0].n;
  };

  it('"0" becomes the number 0', async () => {
    const v = await submitWith('0');
    expect(v).toBe(0);
    expect(typeof v).toBe('number');
  });

  it('"" (optional, untouched) is not converted to 0 or NaN', async () => {
    const v = await submitWith('');
    expect(v).not.toBe(0);
    expect(Number.isNaN(v)).toBe(false);
  });

  it('decimal and negative strings are converted', async () => {
    expect(await submitWith('-3.75')).toBe(-3.75);
  });

  it('non-number fields stay strings (e.g. tel "0123")', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FormModal title="T" fields={[{ name: 't', label: 'T', type: 'tel' }]} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('T'), { target: { value: '0123' } });
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ t: '0123' }));
  });
});

describe('FormModal — submit / errors / close', () => {
  it('onSubmit rejection with Error shows message inline and keeps modal open', async () => {
    const onClose = vi.fn();
    render(<FormModal title="T" fields={[]} onSubmit={vi.fn().mockRejectedValue(new Error('Email already exists'))} onClose={onClose} />);
    fireEvent.click(submitBtn());
    expect(await screen.findByText('Email already exists')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect((submitBtn() as HTMLButtonElement).disabled).toBe(false);
  });

  it('onSubmit rejection with a non-Error shows the generic "Failed to save"', async () => {
    render(<FormModal title="T" fields={[]} onSubmit={vi.fn().mockRejectedValue('boom')} onClose={vi.fn()} />);
    fireEvent.click(submitBtn());
    expect(await screen.findByText('Failed to save')).toBeTruthy();
  });

  it('previous form error is cleared on a successful retry', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Nope')).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<FormModal title="T" fields={[]} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(submitBtn());
    await screen.findByText('Nope');
    fireEvent.click(submitBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Nope')).toBeNull();
  });

  it('shows Saving... and disables submit while pending (no double submit)', async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    const onClose = vi.fn();
    render(<FormModal title="T" fields={[]} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(submitBtn());
    const busyBtn = await screen.findByRole('button', { name: 'Saving...' });
    expect((busyBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busyBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Cancel, the close (x) button and backdrop click call onClose; clicks inside the form do not', () => {
    const onClose = vi.fn();
    render(<FormModal title="T" fields={allFields} onSubmit={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/^Name/));
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(document.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
