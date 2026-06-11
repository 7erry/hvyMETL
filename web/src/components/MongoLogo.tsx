/** MongoDB-inspired leaf mark + hvyMETL wordmark (official LeafyGreen colors). */
export function MongoLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
      <svg width="36" height="36" viewBox="0 0 32 32" aria-label="MongoDB leaf">
        <path
          fill="#00ED64"
          d="M16.1 2.2c-5.6 3.8-9.5 9.8-9.5 16.3 0 4.2 1.8 8.1 4.8 10.9-.3-4.8.8-10.5 4.7-15.1 1-.9 2.2-1.8 3.4-2.6-1.2 2.4-1.9 5.1-1.9 7.9 0 6.2 3.2 11.6 8 14.6 4.8-3 8-9.4 8-14.6 0-8.6-6.2-15.8-14.5-17.2z"
        />
      </svg>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#00ED64', lineHeight: 1.1 }}>hvyMETL</div>
        <div style={{ fontSize: '0.7rem', color: '#E3FCF7', opacity: 0.85 }}>High Volume MongoDB ETL Studio</div>
      </div>
    </div>
  );
}
