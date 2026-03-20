<script setup lang="ts">
const state = useChartState()
const linkLabel = ref('')

const showLinkModal = computed(
  () => state.pendingLink.value != null || state.editingRelationshipId.value != null
)

const isEditMode = computed(() => state.editingRelationshipId.value != null)

const editingRelationship = computed(() => {
  const id = state.editingRelationshipId.value
  return id != null ? state.getRelationship(id) : null
})

const fromCardName = computed(() => {
  const rel = editingRelationship.value
  if (!rel) return ''
  return state.getCard(rel.fromId)?.name || '—'
})

const toCardName = computed(() => {
  const rel = editingRelationship.value
  if (!rel) return ''
  return state.getCard(rel.toId)?.name || '—'
})

watch(
  () => state.pendingLink.value,
  (p) => {
    linkLabel.value = p ? '' : linkLabel.value
  },
  { immediate: true }
)

watch(
  () => state.editingRelationshipId.value,
  (id) => {
    if (id != null) {
      const rel = state.getRelationship(id)
      linkLabel.value = rel ? rel.label : ''
    }
  },
  { immediate: true }
)

function close() {
  state.modalLinkOpen.value = false
  state.pendingLink.value = null
  state.editingRelationshipId.value = null
}

function save() {
  if (isEditMode.value && state.editingRelationshipId.value != null) {
    state.updateRelationship(state.editingRelationshipId.value, {
      label: linkLabel.value.trim() || '—'
    })
  } else {
    const p = state.pendingLink.value
    if (!p) return
    state.addRelationship(p.fromId, p.toId, linkLabel.value)
  }
  close()
}
</script>

<template>
  <div
    class="modal-overlay"
    :class="{ active: showLinkModal }"
    :aria-hidden="!showLinkModal"
    @click.self="close"
  >
    <div class="modal" role="dialog">
      <div class="modal-header">
        <h2>{{ isEditMode ? 'Edit relationship' : 'Relationship label' }}</h2>
        <button type="button" class="modal-close" aria-label="Close" @click="close">
          &times;
        </button>
      </div>
      <div class="modal-body">
        <template v-if="isEditMode">
          <div class="detail-row">
            <span class="detail-label">From</span>
            <span class="detail-value">{{ fromCardName }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">To</span>
            <span class="detail-value">{{ toCardName }}</span>
          </div>
        </template>
        <div class="form-group">
          <label for="link-label">Label (e.g. 100%, 1 share)</label>
          <input id="link-label" v-model="linkLabel" type="text" placeholder="100%">
        </div>
        <button type="button" class="btn-primary" @click="save">
          {{ isEditMode ? 'Save' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>
