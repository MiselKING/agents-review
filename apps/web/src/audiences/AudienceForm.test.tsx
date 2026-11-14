import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockGraphql, renderWithProviders } from '../test/render';
import type { AudienceValues } from './api';
import { emptyDraft } from './audience-draft';
import { AudienceForm } from './AudienceForm';

const countries = [
  { code: 'FRA', name: 'France' },
  { code: 'DEU', name: 'Germany' },
  { code: 'SWE', name: 'Sweden' },
];

let requests: ReturnType<typeof mockGraphql>;

beforeEach(() => {
  requests = mockGraphql({
    Countries: () => ({ countries }),
    AudiencePreviewCount: () => ({ previewAudience: { memberCount: 1234 } }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderForm() {
  const onSave = vi.fn<(values: AudienceValues) => void>();
  renderWithProviders(
    <AudienceForm
      initial={emptyDraft()}
      submitLabel="Create audience"
      isSaving={false}
      saveError={null}
      onSave={onSave}
    />,
  );
  return { onSave, user: userEvent.setup() };
}

async function chooseCountry(
  user: ReturnType<typeof userEvent.setup>,
  position: number,
  search: string,
  option: RegExp,
) {
  const input = screen.getByLabelText(`Condition ${position} country`);
  await waitFor(() => expect(input).toBeEnabled());
  await user.type(input, search);
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('AudienceForm', () => {
  it('adds conditions up to 20 and removes them down to 1', async () => {
    const { user } = renderForm();
    const add = screen.getByRole('button', { name: 'Add condition' });

    for (let count = 1; count < 20; count += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each click changes the form the next one acts on
      await user.click(add);
    }
    expect(screen.getAllByRole('group', { name: /^Condition \d+$/ })).toHaveLength(20);
    expect(add).toBeDisabled();
    expect(screen.getByText('The limit is 20 conditions.')).toBeInTheDocument();

    for (let position = 20; position > 1; position -= 1) {
      // oxlint-disable-next-line no-await-in-loop -- each click changes the form the next one acts on
      await user.click(screen.getByRole('button', { name: `Remove condition ${position}` }));
    }
    expect(screen.getAllByRole('group', { name: /^Condition \d+$/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove condition 1' })).toBeDisabled();
  });

  it("shows each condition type's own fields", async () => {
    const { user } = renderForm();
    const type = screen.getByLabelText('Condition 1 type');
    expect(screen.getByLabelText('Condition 1 country')).toBeInTheDocument();

    await user.selectOptions(type, 'Event');
    expect(screen.queryByLabelText('Condition 1 country')).not.toBeInTheDocument();
    const event = screen.getByLabelText('Condition 1 event');
    expect(
      within(event)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Purchase', 'Page view']);
    expect(screen.getByLabelText('Condition 1 amount')).toHaveValue('30');

    await user.selectOptions(type, 'Signed up');
    expect(screen.queryByLabelText('Condition 1 event')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Condition 1 operator'), 'more than');
    expect(screen.getByText('ago')).toBeInTheDocument();
  });

  it('shows the problems next to their fields and does not save', async () => {
    const { onSave, user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Create audience' }));

    const name = screen.getByLabelText('Name');
    expect(name).toHaveAccessibleDescription('Enter a name.');
    expect(screen.getByLabelText('Condition 1 country')).toHaveAccessibleDescription(
      'Choose a country.',
    );
    expect(name).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a problem once a field is left', async () => {
    const { user } = renderForm();
    await user.selectOptions(screen.getByLabelText('Condition 1 type'), 'Signed up');
    const amount = screen.getByLabelText('Condition 1 amount');
    await user.clear(amount);
    await user.type(amount, '0');
    expect(amount).not.toHaveAccessibleDescription();
    await user.tab();
    expect(amount).toHaveAccessibleDescription('Enter a whole number from 1 to 1000.');
  });

  it('finds a country by name or by code', async () => {
    const { user } = renderForm();
    const input = screen.getByLabelText('Condition 1 country');
    await waitFor(() => expect(input).toBeEnabled());

    await user.type(input, 'deu');
    expect(await screen.findByRole('option', { name: /Germany/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /France/ })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'swe');
    expect(await screen.findByRole('option', { name: /Sweden/ })).toBeInTheDocument();
  });

  it('shows the live member count once the filter is complete', async () => {
    const { user } = renderForm();
    expect(screen.getByText('Complete the conditions to see a count.')).toBeInTheDocument();

    await chooseCountry(user, 1, 'germ', /Germany/);
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(
      requests.find((request) => request.operation === 'AudiencePreviewCount')?.variables,
    ).toEqual({
      definition: {
        version: 1,
        match: 'ALL',
        conditions: [{ attribute: { field: 'COUNTRY', operator: 'IS', value: 'DEU' } }],
      },
    });
  });

  it("saves the trimmed name and the filter in the API's shape", async () => {
    const { onSave, user } = renderForm();
    await user.type(screen.getByLabelText('Name'), '  Lapsed Germans  ');
    await user.click(screen.getByLabelText('Any condition'));
    await chooseCountry(user, 1, 'Germany', /Germany/);

    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.selectOptions(screen.getByLabelText('Condition 2 type'), 'Event');
    await user.selectOptions(screen.getByLabelText('Condition 2 operator'), 'did not');
    const amount = screen.getByLabelText('Condition 2 amount');
    await user.clear(amount);
    await user.type(amount, '3');
    await user.selectOptions(screen.getByLabelText('Condition 2 unit'), 'months');

    await user.click(screen.getByRole('button', { name: 'Create audience' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Lapsed Germans',
      definition: {
        version: 1,
        match: 'ANY',
        conditions: [
          { attribute: { field: 'COUNTRY', operator: 'IS', value: 'DEU' } },
          {
            event: {
              eventType: 'purchase',
              operator: 'NOT_PERFORMED',
              window: { amount: 3, unit: 'MONTH' },
            },
          },
        ],
      },
    });
  });

  it('shows an error from the API and keeps what was entered', () => {
    renderWithProviders(
      <AudienceForm
        initial={{ ...emptyDraft(), name: 'Kept' }}
        submitLabel="Create audience"
        isSaving={false}
        saveError={new Error('definition.version 2 is not supported.')}
        onSave={vi.fn<(values: AudienceValues) => void>()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('definition.version 2 is not supported.');
    expect(screen.getByLabelText('Name')).toHaveValue('Kept');
  });
});
