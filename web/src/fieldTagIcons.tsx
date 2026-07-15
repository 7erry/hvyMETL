/** Field pattern tags shown on MongoDB collection diagram rows. */
export type MongoFieldTag = 'id' | 'embed' | 'denorm' | 'computed' | 'bucket' | 'index' | 'meta';

/** Glyphs used in collection nodes and the footer legend (keep in sync). */
export const MONGO_FIELD_TAG_GLYPH: Record<Exclude<MongoFieldTag, 'meta'>, string> = {
  id: '🔑',
  embed: '⊕',
  denorm: '⇢',
  computed: 'ƒ',
  bucket: '⏱',
  index: '◆',
};

export const SQL_COLUMN_GLYPH = {
  pk: '🔑',
  fk: '↗',
} as const;

const TAG_PRIORITY: MongoFieldTag[] = ['id', 'embed', 'denorm', 'computed', 'bucket', 'index'];

/** Return the single leading glyph for a field row (first matching tag wins). */
export function mongoFieldTagGlyph(tags: string[]): string {
  for (const tag of TAG_PRIORITY) {
    if (tags.includes(tag) && tag !== 'meta') {
      return MONGO_FIELD_TAG_GLYPH[tag as Exclude<MongoFieldTag, 'meta'>];
    }
  }
  return '';
}

/** Prefix string for collection node field labels, e.g. "⊕ inventories". */
export function mongoFieldTagPrefix(tags: string[]): string {
  const glyph = mongoFieldTagGlyph(tags);
  return glyph ? `${glyph} ` : '';
}

type DiagramTagIconProps = {
  className?: string;
};

/** Legend / footer icon for MongoDB _id fields. */
export function MongoIdTagIcon({ className }: DiagramTagIconProps) {
  return (
    <span className={['diagram-tag-icon', 'diagram-tag-icon--id', className].filter(Boolean).join(' ')} aria-hidden>
      {MONGO_FIELD_TAG_GLYPH.id}
    </span>
  );
}

/** Legend / footer icon for embedded array fields. */
export function MongoEmbedTagIcon({ className }: DiagramTagIconProps) {
  return (
    <span className={['diagram-tag-icon', 'diagram-tag-icon--embed', className].filter(Boolean).join(' ')} aria-hidden>
      {MONGO_FIELD_TAG_GLYPH.embed}
    </span>
  );
}

/** Legend / footer icon for extended-reference (denormalized) fields. */
export function MongoDenormTagIcon({ className }: DiagramTagIconProps) {
  return (
    <span className={['diagram-tag-icon', 'diagram-tag-icon--denorm', className].filter(Boolean).join(' ')} aria-hidden>
      {MONGO_FIELD_TAG_GLYPH.denorm}
    </span>
  );
}

/** Legend / footer icon for SQL primary keys. */
export function SqlPkTagIcon({ className }: DiagramTagIconProps) {
  return (
    <span className={['diagram-tag-icon', 'diagram-tag-icon--sql-pk', className].filter(Boolean).join(' ')} aria-hidden>
      {SQL_COLUMN_GLYPH.pk}
    </span>
  );
}

/** Legend / footer icon for SQL foreign keys. */
export function SqlFkTagIcon({ className }: DiagramTagIconProps) {
  return (
    <span className={['diagram-tag-icon', 'diagram-tag-icon--sql-fk', className].filter(Boolean).join(' ')} aria-hidden>
      {SQL_COLUMN_GLYPH.fk}
    </span>
  );
}
