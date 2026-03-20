<script setup lang="ts">
const state = useChartState()

const showCardModal = computed(() => state.modalCardOpen.value)
const showViewMode = computed(() => state.modalCardViewMode.value)

const card = computed(() =>
  state.editingCardId.value != null ? state.getCard(state.editingCardId.value) : null
)

const isNew = computed(() => {
  const c = card.value
  return c && !c.name && !c.jurisdiction && !(c.details && Object.keys(c.details).length)
})

const formName = ref('')
const formJurisdiction = ref('')
const formRegistrationAddress = ref('')
const formIncorporationDate = ref('')
const formShareCapital = ref('')
const formRemark = ref('')
const formDirectors = ref<string[]>([''])
const formShareholders = ref<string[]>([''])

function ensureArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.slice().map(String)
  if (val == null || val === '') return []
  const s = String(val).trim()
  return s ? [s] : []
}

watch(
  () => state.editingCardId.value,
  (id) => {
    const c = id != null ? state.getCard(id) : null
    if (c) {
      formName.value = c.name || ''
      formJurisdiction.value = c.jurisdiction || ''
      formRegistrationAddress.value = String(c.details?.RegistrationAddress ?? '').trim()
      formIncorporationDate.value = String(c.details?.IncorporationDate ?? '').trim()
      formShareCapital.value = String(c.details?.ShareCapital ?? '').trim()
      formRemark.value = String(c.details?.Remark ?? '').trim()
      const dirs = ensureArray(c.details?.Director)
      formDirectors.value = dirs.length ? dirs : ['']
      const shrs = ensureArray(c.details?.Shareholder)
      formShareholders.value = shrs.length ? shrs : ['']
    }
  },
  { immediate: true }
)

function close() {
  state.modalCardOpen.value = false
}

function save() {
  const c = card.value
  if (!c) return
  state.updateCard(c.id, {
    name: formName.value.trim() || 'Unnamed company',
    jurisdiction: formJurisdiction.value.trim() || '',
    details: {
      ...c.details,
      RegistrationAddress: formRegistrationAddress.value.trim() || undefined,
      IncorporationDate: formIncorporationDate.value.trim() || undefined,
      ShareCapital: formShareCapital.value.trim() || undefined,
      Remark: formRemark.value.trim() || undefined,
      Director: formDirectors.value.map((s) => s.trim()).filter(Boolean),
      Shareholder: formShareholders.value.map((s) => s.trim()).filter(Boolean)
    }
  })
  close()
}

function switchToEdit() {
  state.modalCardViewMode.value = false
}

function deleteCompany() {
  const c = card.value
  if (!c) return
  if (!confirm(`Delete "${c.name || 'this company'}"? This will also remove all its connections.`)) return
  state.deleteCard(c.id)
  close()
}

</script>

<template>
  <div
    class="modal-overlay"
    :class="{ active: showCardModal }"
    :aria-hidden="!showCardModal"
    @click.self="close"
  >
    <div class="modal" role="dialog">
      <div class="modal-header">
        <h2>{{ showViewMode ? (card?.name || 'Company') : (card?.name || 'Company details') }}</h2>
        <button type="button" class="modal-close" aria-label="Close" @click="close">
          &times;
        </button>
      </div>
      <div class="modal-body">
        <!-- View mode -->
        <template v-if="showViewMode && card">
          <div class="detail-row">
            <span class="detail-label">Jurisdiction</span>
            <span class="detail-value">{{ card.jurisdiction || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Registration address</span>
            <span class="detail-value detail-value--right">{{ (card.details?.RegistrationAddress as string) || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Incorporation date</span>
            <span class="detail-value">{{ (card.details?.IncorporationDate as string) || '—' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Share capital</span>
            <span class="detail-value detail-value--right">{{ (card.details?.ShareCapital as string) || '—' }}</span>
          </div>
          <div class="detail-row detail-row--stack">
            <span class="detail-label">Director(s)</span>
            <div class="detail-value detail-value--list">
              <template v-if="(card.details?.Director as string[] | undefined)?.length">
                <span
                  v-for="(d, i) in (card.details?.Director as string[])"
                  :key="'d-' + i"
                  class="detail-value-item"
                >{{ d }}</span>
              </template>
              <span v-else class="detail-value-item">—</span>
            </div>
          </div>
          <div class="detail-row detail-row--stack">
            <span class="detail-label">Shareholder(s)</span>
            <div class="detail-value detail-value--list">
              <template v-if="(card.details?.Shareholder as string[] | undefined)?.length">
                <span
                  v-for="(s, i) in (card.details?.Shareholder as string[])"
                  :key="'s-' + i"
                  class="detail-value-item"
                >{{ s }}</span>
              </template>
              <span v-else class="detail-value-item">—</span>
            </div>
          </div>
          <div v-if="(card.details?.Remark as string)" class="detail-row detail-row--stack">
            <span class="detail-label">Remark</span>
            <div class="detail-value detail-value--remark">{{ (card.details?.Remark as string) }}</div>
          </div>
          <button type="button" class="btn-primary-secondary" @click="switchToEdit">
            Edit
          </button>
          <button type="button" class="btn-danger" @click="deleteCompany">
            Delete company
          </button>
        </template>
        <!-- Edit form mode -->
        <template v-else-if="card">
          <div class="form-group">
            <label>Company name</label>
            <input v-model="formName" type="text" placeholder="e.g. Acme Ltd">
          </div>
          <div class="form-group">
            <label>Jurisdiction</label>
            <input v-model="formJurisdiction" type="text" placeholder="e.g. Cayman, Hong Kong">
          </div>
          <div class="form-group">
            <label>Registration address</label>
            <input v-model="formRegistrationAddress" type="text" placeholder="e.g. 123 Main St, City">
          </div>
          <div class="form-group">
            <label>Incorporation date</label>
            <input v-model="formIncorporationDate" type="text" placeholder="e.g. 2020-01-15 or Jan 2020">
          </div>
          <div class="form-group">
            <label>Share capital</label>
            <input v-model="formShareCapital" type="text" placeholder="e.g. USD 1,000,000">
          </div>
          <div class="form-group">
            <label>Director(s)</label>
            <div class="multi-list">
              <div v-for="(_, i) in formDirectors" :key="'dir-' + i" class="item-row">
                <input v-model="formDirectors[i]" type="text" placeholder="Name">
                <button
                  type="button"
                  class="remove-btn"
                  aria-label="Remove"
                  @click="formDirectors.splice(i, 1); if (formDirectors.length === 0) formDirectors.push('')"
                >
                  &times;
                </button>
              </div>
            </div>
            <button
              type="button"
              class="add-btn"
              @click="formDirectors.push('')"
            >
              + Add director
            </button>
          </div>
          <div class="form-group">
            <label>Shareholder(s)</label>
            <div class="multi-list">
              <div v-for="(_, i) in formShareholders" :key="'shr-' + i" class="item-row">
                <input v-model="formShareholders[i]" type="text" placeholder="e.g. Parent Co (100%)">
                <button
                  type="button"
                  class="remove-btn"
                  aria-label="Remove"
                  @click="formShareholders.splice(i, 1); if (formShareholders.length === 0) formShareholders.push('')"
                >
                  &times;
                </button>
              </div>
            </div>
            <button
              type="button"
              class="add-btn"
              @click="formShareholders.push('')"
            >
              + Add shareholder
            </button>
          </div>
          <div class="form-group">
            <label>Remark</label>
            <textarea v-model="formRemark" rows="3" placeholder="Optional notes"></textarea>
          </div>
          <button type="button" class="btn-primary" @click="save">
            {{ isNew ? 'Add company' : 'Save' }}
          </button>
          <button v-if="!isNew" type="button" class="btn-danger" @click="deleteCompany">
            Delete company
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
