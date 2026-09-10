import type { AppState } from '../domain/types'

function uniqueByKey<Item>(items: Item[], key: (item: Item) => string) {
  const unique = new Map<string, Item>()
  items.forEach((item) => unique.set(key(item), item))
  return [...unique.values()]
}

function emptyFinancial() {
  return {
    invoiceValue: 0,
    theoreticalRevenue: 0,
    realTakings: 0,
    stockRevenue: 0,
  }
}

function emptyReview() {
  return {
    pending: 0,
    unrecognized: 0,
    possibleDuplicates: 0,
  }
}

export function createWorkspaceState(state: AppState): AppState {
  return {
    ...state,
    stores: [],
    sellers: [],
    review: emptyReview(),
    reviewDocuments: [],
    financial: emptyFinancial(),
    accounting: {
      ...state.accounting,
      companies: uniqueByKey(
        state.accounting.companies,
        (company) => company.id,
      ),
      invoices: [],
      takings: [],
      sellers: [],
      suppliers: [],
      products: [],
      rentals: [],
      accountantInvoices: [],
      expenses: [],
      productionSettings: [],
      productionEntries: [],
      productionViewSettings: [],
      productionWorkerRates: [],
      productionWorkEntries: [],
      verificationSettings: [],
      verificationStockLoads: [],
      verificationProductionEntries: [],
      verificationTransfers: [],
      productionVerificationSections: [],
      productionVerificationEntries: [],
    },
  }
}

export function createCompanyState(
  state: AppState,
  companyId: string,
): AppState {
  const accountingCompany = state.accounting.companies.find(
    (company) => company.id === companyId,
  )
  return {
    ...state,
    company: accountingCompany
      ? {
          ...state.company,
          id: accountingCompany.id,
          name: accountingCompany.name,
          taxId: accountingCompany.taxId,
        }
      : state.company,
    stores: state.stores.filter((store) => store.companyId === companyId),
    sellers: state.sellers.filter((seller) => seller.companyId === companyId),
    review: emptyReview(),
    reviewDocuments: state.reviewDocuments.filter(
      (document) => document.companyId === companyId,
    ),
    financial: emptyFinancial(),
    accounting: {
      companies: accountingCompany ? [accountingCompany] : [],
      activeCompanyId: companyId,
      invoices: state.accounting.invoices.filter(
        (invoice) => invoice.companyId === companyId,
      ),
      takings: state.accounting.takings.filter(
        (taking) => taking.companyId === companyId,
      ),
      sellers: state.accounting.sellers.filter(
        (seller) => seller.companyId === companyId,
      ),
      suppliers: state.accounting.suppliers.filter(
        (supplier) => supplier.companyId === companyId,
      ),
      products: state.accounting.products.filter(
        (product) => product.companyId === companyId,
      ),
      rentals: state.accounting.rentals.filter(
        (rental) => rental.companyId === companyId,
      ),
      accountantInvoices: state.accounting.accountantInvoices.filter(
        (invoice) => invoice.companyId === companyId,
      ),
      expenses: state.accounting.expenses.filter(
        (expense) => expense.companyId === companyId,
      ),
      productionSettings: state.accounting.productionSettings.filter(
        (settings) => settings.companyId === companyId,
      ),
      productionEntries: state.accounting.productionEntries.filter(
        (entry) => entry.companyId === companyId,
      ),
      productionViewSettings: state.accounting.productionViewSettings.filter(
        (settings) => settings.companyId === companyId,
      ),
      productionWorkerRates: state.accounting.productionWorkerRates.filter(
        (settings) => settings.companyId === companyId,
      ),
      productionWorkEntries: state.accounting.productionWorkEntries.filter(
        (entry) => entry.companyId === companyId,
      ),
      verificationSettings: state.accounting.verificationSettings.filter(
        (settings) => settings.companyId === companyId,
      ),
      verificationStockLoads: state.accounting.verificationStockLoads.filter(
        (entry) => entry.companyId === companyId,
      ),
      verificationProductionEntries:
        state.accounting.verificationProductionEntries.filter(
          (entry) => entry.companyId === companyId,
        ),
      verificationTransfers: state.accounting.verificationTransfers.filter(
        (transfer) => transfer.companyId === companyId,
      ),
      productionVerificationSections:
        state.accounting.productionVerificationSections.filter(
          (section) => section.companyId === companyId,
        ),
      productionVerificationEntries:
        state.accounting.productionVerificationEntries.filter(
          (entry) => entry.companyId === companyId,
        ),
    },
  }
}

export function mergeCompanyStates(
  workspace: AppState,
  companies: AppState[],
): AppState {
  const workspaceCompanies = uniqueByKey(
    workspace.accounting.companies,
    (company) => company.id,
  )
  const workspaceCompanyIds = new Set(
    workspaceCompanies.map((company) => company.id),
  )
  const isolatedCompanies = companies.flatMap((state) => {
    const companyId = state.accounting.activeCompanyId
    if (!companyId || !workspaceCompanyIds.has(companyId)) return []
    return [createCompanyState(state, companyId)]
  })
  const companyItems = <Item extends { id: string; companyId: string }>(
    select: (state: AppState) => Item[],
  ) =>
    uniqueByKey(
      isolatedCompanies.flatMap(select),
      (item) => `${item.companyId}:${item.id}`,
    )
  const companySettings = <Item extends { companyId: string }>(
    select: (state: AppState) => Item[],
  ) =>
    uniqueByKey(
      isolatedCompanies.flatMap(select),
      (item) => item.companyId,
    )

  return {
    ...workspace,
    stores: companyItems((state) => state.stores),
    sellers: companyItems((state) => state.sellers),
    reviewDocuments: companyItems((state) => state.reviewDocuments),
    accounting: {
      ...workspace.accounting,
      companies: workspaceCompanies,
      invoices: companyItems((state) => state.accounting.invoices),
      takings: companyItems((state) => state.accounting.takings),
      sellers: companyItems((state) => state.accounting.sellers),
      suppliers: companyItems((state) => state.accounting.suppliers),
      products: companyItems((state) => state.accounting.products),
      rentals: companyItems((state) => state.accounting.rentals),
      accountantInvoices: companyItems(
        (state) => state.accounting.accountantInvoices,
      ),
      expenses: companyItems((state) => state.accounting.expenses),
      productionSettings: companyItems(
        (state) => state.accounting.productionSettings,
      ),
      productionEntries: companyItems(
        (state) => state.accounting.productionEntries,
      ),
      productionViewSettings: companySettings(
        (state) => state.accounting.productionViewSettings,
      ),
      productionWorkerRates: companyItems(
        (state) => state.accounting.productionWorkerRates,
      ),
      productionWorkEntries: companyItems(
        (state) => state.accounting.productionWorkEntries,
      ),
      verificationSettings: companySettings(
        (state) => state.accounting.verificationSettings,
      ),
      verificationStockLoads: companyItems(
        (state) => state.accounting.verificationStockLoads,
      ),
      verificationProductionEntries: companyItems(
        (state) => state.accounting.verificationProductionEntries,
      ),
      verificationTransfers: companyItems(
        (state) => state.accounting.verificationTransfers,
      ),
      productionVerificationSections: companyItems(
        (state) => state.accounting.productionVerificationSections,
      ),
      productionVerificationEntries: companyItems(
        (state) => state.accounting.productionVerificationEntries,
      ),
    },
  }
}
