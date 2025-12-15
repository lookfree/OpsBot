/**
 * SQL Editor Component using Monaco Editor
 */

import { useRef, useCallback } from 'react'
import Editor, { OnMount, Monaco } from '@monaco-editor/react'
import type { editor, IRange, Position } from 'monaco-editor'
import { useThemeStore } from '@/stores'

interface ITextModel {
  getWordUntilPosition(position: Position): { word: string; startColumn: number; endColumn: number }
}

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onExecute?: () => void
  className?: string
}

export function SqlEditor({ value, onChange, onExecute, className }: SqlEditorProps) {
  const { theme } = useThemeStore()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleEditorDidMount: OnMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor

      // Register SQL keywords for better autocomplete
      monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model: ITextModel, position: Position) => {
          const word = model.getWordUntilPosition(position)
          const range: IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          }

          const keywords = [
            'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE',
            'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET',
            'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
            'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'ADD COLUMN',
            'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'ON',
            'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
            'NULL', 'IS NULL', 'IS NOT NULL', 'TRUE', 'FALSE',
            'ASC', 'DESC', 'UNION', 'UNION ALL', 'EXCEPT', 'INTERSECT',
            'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
            'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'INDEX', 'UNIQUE',
            'VARCHAR', 'INT', 'INTEGER', 'BIGINT', 'TEXT', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP',
          ]

          const suggestions = keywords.map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
          }))

          return { suggestions }
        },
      })

      // Add keyboard shortcut for execute (Ctrl+Enter or Cmd+Enter)
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        onExecute?.()
      })

      // Add keyboard shortcut for execute selected (Ctrl+Shift+Enter)
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => {
          const selection = editor.getSelection()
          if (selection && !selection.isEmpty()) {
            const selectedText = editor.getModel()?.getValueInRange(selection)
            if (selectedText) {
              console.log('Execute selected:', selectedText)
              // TODO: Implement execute selected functionality
            }
          } else {
            onExecute?.()
          }
        }
      )
    },
    [onExecute]
  )

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onChange(value || '')
    },
    [onChange]
  )

  return (
    <div className={className}>
      <Editor
        height="100%"
        defaultLanguage="sql"
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          padding: { top: 8, bottom: 8 },
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          acceptSuggestionOnEnter: 'on',
        }}
      />
    </div>
  )
}
