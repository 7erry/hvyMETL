/** MongoDB leaf mark + hvyMETL wordmark and project purpose. */
export function MongoLogo() {
  return (
    <div className="app-logo" aria-label="hvyMETL — SQL to MongoDB Migration Studio">
      <svg className="app-logo__leaf" viewBox="0 0 32 32" aria-hidden="true">
        <path
          fill="currentColor"
          d="M16.1 2.2c-5.6 3.8-9.5 9.8-9.5 16.3 0 4.2 1.8 8.1 4.8 10.9-.3-4.8.8-10.5 4.7-15.1 1-.9 2.2-1.8 3.4-2.6-1.2 2.4-1.9 5.1-1.9 7.9 0 6.2 3.2 11.6 8 14.6 4.8-3 8-9.4 8-14.6 0-8.6-6.2-15.8-14.5-17.2z"
        />
      </svg>
      <div className="app-logo__text">
        <div className="app-logo__title">hvyMETL</div>
        <div className="app-logo__tagline">SQL to MongoDB Migration Studio</div>
      </div>
    </div>
  );
}
