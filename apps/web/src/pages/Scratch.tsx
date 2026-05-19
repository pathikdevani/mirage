import Editor from '@monaco-editor/react';
import { useState } from 'react';

const SAMPLE = `// Custom Function scratch pad
// Signature: (ctx) => string
export default function (ctx) {
  return ctx.faker.person.firstName();
}
`;

export function ScratchPage() {
  const [value, setValue] = useState<string>(SAMPLE);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Scratch</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Placeholder for the Custom Function editor. Wired with Monaco so the editor infrastructure
        is proven end-to-end.
      </p>

      <div className="mt-4 overflow-hidden rounded-md border">
        <Editor
          height="60vh"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={value}
          onChange={(v) => setValue(v ?? '')}
          options={{
            minimap: { enabled: false },
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}
        />
      </div>
    </main>
  );
}
