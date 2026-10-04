export function distributionConfig(
  platform: string,
  env?: Record<string, string | undefined>,
): {
  config: Record<string, unknown>;
  signing: boolean;
  notarizing: boolean;
  environment: Record<string, string | undefined>;
};
