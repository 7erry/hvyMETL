/**
 * Prism grammars for ArtifactCodePanel — load in dependency order on one Prism instance.
 */
import Prism from 'prismjs/components/prism-core.js';

const globalScope = globalThis as typeof globalThis & { Prism?: typeof Prism };
globalScope.Prism = Prism;

import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-markup.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-kotlin.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-php.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-ruby.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-scala.js';
import 'prismjs/components/prism-swift.js';
import 'prismjs/components/prism-typescript.js';

export const highlight = Prism.highlight;
export const languages = Prism.languages;
