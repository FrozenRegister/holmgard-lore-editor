<script lang="ts">
  import { settings } from '$lib/stores';
  import { getAdminSecret } from '$lib/auth';
  import { fetchEntityRelations } from '$lib/d1-reads';
  import { createEntityRelation, deleteEntityRelation, updateEntityRelation } from '$lib/d1-writes';
  import { ENTITY_FETCHERS } from '$lib/d1-reads';
  import type { EntityRelationRecord } from '$lib/d1-reads';

  // ── Props ─────────────────────────────────────────────────────────────────────
  // entityTypeSlug: plural API slug, e.g. "characters", "locations"
  export let entityTypeSlug: string;
  export let entityId: string;
  export let onClose: () => void = () => {};

  // ── State ─────────────────────────────────────────────────────────────────────
  let relations: EntityRelationRecord[] = [];
  let loading = false;
  let error: string | null = null;

  let showAddForm = false;
  let addError: string | null = null;
  let adding = false;

  let form = {
    to_type: 'characters',
    to_id: '',
    relation_type: '',
    attitude: 0,
    has_attitude: false,
    is_bidirectional: true,
    is_pinned: false,
    is_private: false,
    notes: '',
  };

  // For target entity autocomplete
  let targetOptions: { id: string; name: string }[] = [];
  let loadingTargets = false;

  const ENTITY_TYPES = [
    { slug: 'characters', label: 'Character' },
    { slug: 'locations',  label: 'Location' },
    { slug: 'nations',    label: 'Nation' },
    { slug: 'regions',    label: 'Region' },
    { slug: 'quests',     label: 'Quest' },
    { slug: 'items',      label: 'Item' },
    { slug: 'notes',      label: 'Note' },
  ];

  const RELATION_SUGGESTIONS = [
    'ally', 'enemy', 'friend', 'rival', 'neutral', 'partner',
    'knows', 'serves', 'commands', 'protects', 'hunts', 'fears',
    'owns', 'visits', 'involves', 'participates', 'guards', 'haunts',
  ];

  // ── Load ──────────────────────────────────────────────────────────────────────
  $: if (entityTypeSlug && entityId && $settings.workerHost) loadRelations();

  async function loadRelations() {
    loading = true;
    error = null;
    try {
      relations = await fetchEntityRelations($settings.workerHost, entityTypeSlug, entityId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load relations';
    } finally {
      loading = false;
    }
  }

  async function loadTargetOptions() {
    loadingTargets = true;
    targetOptions = [];
    try {
      const fetcher = ENTITY_FETCHERS[form.to_type];
      if (fetcher) {
        const entities = await fetcher($settings.workerHost);
        targetOptions = entities.map(e => ({ id: (e as unknown as Record<string, unknown>).id as string, name: (e as unknown as Record<string, unknown>).name as string }));
      }
    } catch {
      targetOptions = [];
    } finally {
      loadingTargets = false;
    }
  }

  $: if (form.to_type) { form.to_id = ''; loadTargetOptions(); }

  // ── Add ───────────────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!form.to_id || !form.relation_type.trim()) {
      addError = 'Target entity and relation type are required.';
      return;
    }
    addError = null;
    adding = true;
    try {
      const secret = await getAdminSecret();
      if (!secret) { addError = 'No admin secret — configure in Settings'; return; }
      await createEntityRelation($settings.workerHost, {
        from_type: entityTypeSlug,
        from_id:   entityId,
        to_type:   form.to_type,
        to_id:     form.to_id,
        relation_type: form.relation_type.trim(),
        attitude:  form.has_attitude ? form.attitude : null,
        is_bidirectional: form.is_bidirectional,
        is_pinned:   form.is_pinned,
        is_private:  form.is_private,
        notes: form.notes.trim() || null,
      }, secret);
      showAddForm = false;
      resetForm();
      await loadRelations();
    } catch (e) {
      addError = e instanceof Error ? e.message : 'Failed to create relation';
    } finally {
      adding = false;
    }
  }

  function resetForm() {
    form = { to_type: 'characters', to_id: '', relation_type: '', attitude: 0, has_attitude: false, is_bidirectional: true, is_pinned: false, is_private: false, notes: '' };
    addError = null;
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      const secret = await getAdminSecret();
      if (!secret) return;
      await deleteEntityRelation($settings.workerHost, id, secret);
      await loadRelations();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  // ── Toggle pin ────────────────────────────────────────────────────────────────
  async function togglePin(rel: EntityRelationRecord) {
    try {
      const secret = await getAdminSecret();
      if (!secret) return;
      await updateEntityRelation($settings.workerHost, rel.id, { is_pinned: !rel.is_pinned }, secret);
      await loadRelations();
    } catch { /* ignore */ }
  }

  // ── Attitude helpers ──────────────────────────────────────────────────────────
  function attitudeClass(attitude: number | null): string {
    if (attitude === null || attitude === undefined) return '';
    if (attitude > 33) return 'attitude--ally';
    if (attitude < -33) return 'attitude--hostile';
    return 'attitude--neutral';
  }

  function attitudeLabel(attitude: number | null): string {
    if (attitude === null || attitude === undefined) return '';
    if (attitude > 33) return `ally (${attitude})`;
    if (attitude < -33) return `hostile (${attitude})`;
    return `neutral (${attitude})`;
  }

  function otherEntityLabel(rel: EntityRelationRecord): string {
    const isSelf = rel.from_type === entityTypeSlug && rel.from_id === entityId;
    const t = isSelf ? rel.to_type : rel.from_type;
    const id = isSelf ? rel.to_id : rel.from_id;
    const typeLabel = ENTITY_TYPES.find(e => e.slug === t)?.label ?? t;
    return `${typeLabel}: ${id}`;
  }
</script>
