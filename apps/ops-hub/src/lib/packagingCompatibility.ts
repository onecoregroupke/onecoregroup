export type BomSelectionMode = 'all_required' | 'one_of'
export type CompatibilityStatus = 'compatible' | 'preferred' | 'approved_alternative'

export interface BomRequirementLine {
  id: string
  product_item_id: string
  component_item_id: string
  quantity_per_unit: number
  wastage_percent: number
  requirement_group: string
  selection_mode: BomSelectionMode
  compatibility_status: CompatibilityStatus
  active: boolean
}

export interface RequirementComponent {
  id: string
  name: string
  quantity: number
  unit: string
  packaging_role?: string
  is_active?: boolean
}

export interface RequirementGroupView {
  key: string
  selectionMode: BomSelectionMode
  lines: Array<{
    line: BomRequirementLine
    component: RequirementComponent | null
    expected: number
    onHand: number
  }>
  /** Finished units supportable by the group. Alternatives contribute jointly. */
  producibleUnits: number
  shortfallUnits: number
}

function expectedQuantity(line: BomRequirementLine, plannedQuantity: number): number {
  return line.quantity_per_unit * plannedQuantity * (1 + Number(line.wastage_percent || 0) / 100)
}

/**
 * Evaluate required and alternative BOM groups without treating one_of options
 * as multiple mandatory materials. No stock is reserved or substituted here.
 */
export function evaluateRequirementGroups(
  lines: BomRequirementLine[],
  components: RequirementComponent[],
  plannedQuantity: number,
): RequirementGroupView[] {
  const byComponent = new Map(components.map((component) => [component.id, component]))
  const grouped = new Map<string, BomRequirementLine[]>()
  for (const line of lines.filter((candidate) => candidate.active)) {
    const group = line.requirement_group || `line:${line.id}`
    grouped.set(group, [...(grouped.get(group) ?? []), line])
  }

  return [...grouped.entries()].map(([group, groupLines]) => {
    const selectionMode = groupLines[0]?.selection_mode ?? 'all_required'
    const evaluated = groupLines.map((line) => {
      const component = byComponent.get(line.component_item_id) ?? null
      return {
        line,
        component,
        expected: expectedQuantity(line, plannedQuantity),
        onHand: Number(component?.quantity ?? 0),
      }
    })
    const capacities = evaluated.map(({ line, onHand }) => {
      const perUnit = line.quantity_per_unit * (1 + Number(line.wastage_percent || 0) / 100)
      return perUnit > 0 ? onHand / perUnit : 0
    })
    const producibleUnits = selectionMode === 'one_of'
      ? capacities.reduce((sum, value) => sum + value, 0)
      : Math.min(...capacities, Number.POSITIVE_INFINITY)
    const finiteCapacity = Number.isFinite(producibleUnits) ? producibleUnits : 0
    return {
      key: group,
      selectionMode,
      lines: evaluated,
      producibleUnits: Number(finiteCapacity.toFixed(3)),
      shortfallUnits: Number(Math.max(0, plannedQuantity - finiteCapacity).toFixed(3)),
    }
  })
}

export interface CompatibilityExpectation {
  label: string
  componentNames: string[]
  productFamilies: string[]
  packageConfigurations: string[]
  selectionMode: BomSelectionMode
  intentionallyUnresolved?: boolean
}

/** Diagnostic expectations only. The UI always reads the normalized BOM. */
export const NAJMA_COMPATIBILITY_EXPECTATIONS: CompatibilityExpectation[] = [
  { label: 'White trigger pump', componentNames: ['Closure - white triggerpumps'], productFamilies: ['Multi Surface Cleaner', 'Glass Cleaner'], packageConfigurations: ['12x500ml'], selectionMode: 'all_required' },
  { label: 'Yellow cap', componentNames: ['Closure - cap yellow'], productFamilies: ['Dishwashing Liquid'], packageConfigurations: ['12x500ml'], selectionMode: 'all_required' },
  { label: 'Small-pack cap alternatives', componentNames: ['Closure - white caps', 'Closure - GREEN CAPS', 'Closure - PINK CAPS'], productFamilies: ['Fabric Softener', 'Shampoo'], packageConfigurations: ['12x250ml'], selectionMode: 'one_of' },
  { label: 'Fabric Softener 1L / 2L cap', componentNames: ['Closure - white caps'], productFamilies: ['Fabric Softener'], packageConfigurations: ['6x1ltr', '6x2ltrs'], selectionMode: 'all_required' },
  { label: 'Fabric Softener 1L / 2L inserter', componentNames: ['Closure - inserters'], productFamilies: ['Fabric Softener'], packageConfigurations: ['6x1ltr', '6x2ltrs'], selectionMode: 'all_required' },
  { label: 'Handwash pump', componentNames: ['Closure - white pumps'], productFamilies: ['Handwash*'], packageConfigurations: ['12x500ml'], selectionMode: 'all_required' },
  { label: 'Toilet Cleaner cap + inserter pool', componentNames: ['Closure - red caps & inserters'], productFamilies: ['Toilet Cleaner*'], packageConfigurations: ['12x500ml', '12x750ml'], selectionMode: 'all_required' },
  { label: 'Bleach blue cork consolidated pool', componentNames: ['Closure - blue corks'], productFamilies: ['Bleach'], packageConfigurations: ['48x70ml', '12x250ml', '12x500ml', '12x1ltr'], selectionMode: 'all_required' },
  { label: 'Shower Gel white cap', componentNames: ['Closure - white caps'], productFamilies: ['Shower Gel'], packageConfigurations: ['12x400ml', '12x750ml'], selectionMode: 'all_required' },
  { label: 'Multipurpose green-cap alternatives', componentNames: ['Closure - light green caps', 'Closure - dark green caps'], productFamilies: ['Multipurpose Cleaner'], packageConfigurations: ['12x500ml', '12x1ltr'], selectionMode: 'one_of' },
  { label: '5L cork', componentNames: ['Closure - 5L BOTTLES - corks'], productFamilies: ['*'], packageConfigurations: ['1x5ltrs'], selectionMode: 'all_required' },
  { label: '20L cork', componentNames: ['Closure - 20LTR BOTTLES - corks'], productFamilies: ['*'], packageConfigurations: ['1x20ltrs', '1x20lrs'], selectionMode: 'all_required' },
  { label: 'Hand Sanitizer spray allocation', componentNames: ['Closure - small sprays', 'Closure - BIG SPRAY'], productFamilies: ['Hand Sanitizer*'], packageConfigurations: ['112x65ml', '12x500ml'], selectionMode: 'one_of', intentionallyUnresolved: true },
]
