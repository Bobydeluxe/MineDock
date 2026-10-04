import { expect, it } from 'vitest';
import { describeCron } from '../packages/domain/cron-description';
it('describes schedules in all six languages with 24-hour times and preserves invalid input for backend validation', () => {
  const descriptions = ['en', 'fr', 'de', 'es', 'pt', 'it'].map((language) =>
    describeCron('0 4 * * *', language as 'en'),
  );
  expect(new Set(descriptions).size).toBe(6);
  expect(descriptions.every((text) => text.includes('04:00') && !text.includes('*'))).toBe(true);
  expect(describeCron('invalid', 'fr')).toBe('invalid');
  expect(describeCron('*/5 * * * *', 'en')).toContain('5 minutes');
});
