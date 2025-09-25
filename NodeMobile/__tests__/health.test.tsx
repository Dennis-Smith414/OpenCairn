import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

function HealthBadge({ data }: { data?: { ok?: boolean } }) {
  return <Text>{data?.ok ? 'backend ok' : 'backend not ok'}</Text>;
}

test('renders backend ok when health.ok = true', () => {
  const { toJSON } = render(<HealthBadge data={{ ok: true }} />);
  expect(screen.getByText('backend ok')).toBeTruthy();
  expect(toJSON()).toMatchSnapshot();
});
