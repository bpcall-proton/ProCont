import type { AppState } from '../domain/types'

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
    },
  }
}

export function mergeCompanyStates(
  workspace: AppState,
  companies: AppState[],
): AppState {
  return {
    ...workspace,
    stores: companies.flatMap((state) => state.stores),
    sellers: companies.flatMap((state) => state.sellers),
    reviewDocuments: companies.flatMap((state) => state.reviewDocuments),
    accounting: {
      ...workspace.accounting,
      invoices: companies.flatMap((state) => state.accounting.invoices),
      takings: companies.flatMap((state) => state.accounting.takings),
      sellers: companies.flatMap((state) => state.accounting.sellers),
      suppliers: companies.flatMap((state) => state.accounting.suppliers),
      products: companies.flatMap((state) => state.accounting.products),
      rentals: companies.flatMap((state) => state.accounting.rentals),
      accountantInvoices: companies.flatMap(
        (state) => state.accounting.accountantInvoices,
      ),
      expenses: companies.flatMap((state) => state.accounting.expenses),
      productionSettings: companies.flatMap(
        (state) => state.accounting.productionSettings,
      ),
      productionEntries: companies.flatMap(
        (state) => state.accounting.productionEntries,
      ),
    },
  }
}
