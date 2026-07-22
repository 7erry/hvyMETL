/** Dark Swagger UI theme aligned with hvyMETL studio (#112733 / #00ed64). */
export const SWAGGER_UI_DARK_CSS = `
body {
  margin: 0;
  background: #112733;
}

.swagger-ui .topbar {
  display: none;
}

.swagger-ui,
.swagger-ui .info .title,
.swagger-ui .opblock-tag,
.swagger-ui .opblock .opblock-summary-path,
.swagger-ui .response-col_status,
.swagger-ui section.models h4,
.swagger-ui table thead tr td,
.swagger-ui table thead tr th {
  color: #e3fcf7;
}

.swagger-ui .info p,
.swagger-ui .info li,
.swagger-ui .info table,
.swagger-ui .opblock .opblock-summary-description,
.swagger-ui .opblock-description-wrapper p,
.swagger-ui .opblock-external-docs-wrapper p,
.swagger-ui .model,
.swagger-ui .response-col_description__inner p {
  color: #b8c4c1;
}

.swagger-ui a {
  color: #00ed64;
}

.swagger-ui a:hover {
  color: #00d95a;
}

.swagger-ui .opblock-tag {
  border-bottom: 1px solid rgba(0, 237, 100, 0.2);
}

.swagger-ui .opblock {
  background: rgba(0, 0, 0, 0.22);
  border-color: rgba(0, 237, 100, 0.15);
  box-shadow: none;
}

.swagger-ui .opblock .opblock-summary-method {
  background: #00ed64;
  color: #112733;
}

.swagger-ui .opblock-body,
.swagger-ui .responses-inner,
.swagger-ui .model-box,
.swagger-ui .model-box-control {
  background: rgba(0, 0, 0, 0.18);
}

.swagger-ui section.models {
  border-color: rgba(0, 237, 100, 0.2);
}

.swagger-ui .scheme-container {
  background: #0a1419;
  box-shadow: none;
  border: 1px solid rgba(0, 237, 100, 0.15);
}

.swagger-ui .parameter__name,
.swagger-ui .parameter__type,
.swagger-ui .prop-type,
.swagger-ui .prop-format {
  color: #00ed64;
}

.swagger-ui input[type='text'],
.swagger-ui input[type='password'],
.swagger-ui input[type='search'],
.swagger-ui input[type='email'],
.swagger-ui input[type='file'],
.swagger-ui textarea,
.swagger-ui select {
  background: #0a1419;
  color: #e3fcf7;
  border-color: rgba(0, 237, 100, 0.3);
}

.swagger-ui .btn {
  color: #112733;
  background: #00ed64;
  border-color: #00ed64;
}

.swagger-ui .btn:hover {
  background: #00d95a;
  border-color: #00d95a;
}

.swagger-ui .btn.cancel {
  background: transparent;
  color: #e3fcf7;
  border-color: rgba(0, 237, 100, 0.35);
}

.swagger-ui .dialog-ux .modal-ux {
  background: #112733;
  border: 1px solid rgba(0, 237, 100, 0.2);
}

.swagger-ui .dialog-ux .modal-ux-header h3,
.swagger-ui .dialog-ux .modal-ux-content p,
.swagger-ui .dialog-ux .modal-ux-content label {
  color: #e3fcf7;
}

.swagger-ui .auth-container,
.swagger-ui .auth-btn-wrapper {
  border-color: rgba(0, 237, 100, 0.2);
}

.swagger-ui .loading-container .loading::after {
  color: #00ed64;
}
`.trim();

export function swaggerUiSetupOptions(): {
  customSiteTitle: string;
  customCss: string;
  swaggerOptions: { persistAuthorization: boolean };
} {
  return {
    customSiteTitle: 'hvyMETL Migration API',
    customCss: SWAGGER_UI_DARK_CSS,
    swaggerOptions: { persistAuthorization: true },
  };
}
