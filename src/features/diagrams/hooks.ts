import { useCanWriteDocs } from '@/features/docs/hooks'

/**
 * Who may create/edit/delete a diagram in a scope. The diagrams RLS policies
 * use the same private.can_write_document() as docs, so the rule is the same.
 * UI only; RLS re-checks every write.
 */
export const useCanWriteDiagrams = useCanWriteDocs
