import { describe, expect, it } from 'vitest';
import { SWAGGER_UI_DARK_CSS, swaggerUiSetupOptions } from './swaggerUiTheme.js';

describe('swaggerUiTheme', () => {
  it('defaults Swagger UI to the hvyMETL dark palette', () => {
    const options = swaggerUiSetupOptions();
    expect(options.customCss).toBe(SWAGGER_UI_DARK_CSS);
    expect(options.customCss).toContain('background: #112733');
    expect(options.customSiteTitle).toBe('hvyMETL Migration API');
    expect(options.swaggerOptions.persistAuthorization).toBe(true);
  });
});
