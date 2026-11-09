import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import AttendancePage from './pages/AttendancePage';
import EmployeesPage from './pages/EmployeesPage';
import PayrollPage from './pages/PayrollPage';
import ReportsPage from './pages/ReportsPage';
import ShiftsPage from './pages/ShiftsPage';
import { AppLayout } from './layouts/AppLayout';
import AccountsPage from './pages/AccountsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import CustomersPage from './pages/CustomersPage';
import DrinkCategoriesPage from './pages/DrinkCategoriesPage';
import DrinksPage from './pages/DrinksPage';
import HomePage from './pages/HomePage';
import IngredientCategoriesPage from './pages/IngredientCategoriesPage';
import IngredientsPage from './pages/IngredientsPage';
import LoginPage from './pages/LoginPage';
import LoyaltyPage from './pages/LoyaltyPage';
import ManageTablesPage from './pages/ManageTablesPage';
import OrderPage from './pages/OrderPage';
import OrdersHistoryPage from './pages/OrdersHistoryPage';
import PrepPage from './pages/PrepPage';
import StockCountPage from './pages/StockCountPage';
import StockInPage from './pages/StockInPage';
import StockOutPage from './pages/StockOutPage';
import SuppliersPage from './pages/SuppliersPage';
import TablesPage from './pages/TablesPage';
import ToppingsPage from './pages/ToppingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="orders" element={<OrdersHistoryPage />} />
          <Route path="orders/:id" element={<OrderPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="drinks" element={<DrinksPage />} />
          <Route path="toppings" element={<ToppingsPage />} />
          <Route path="drink-categories" element={<DrinkCategoriesPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="ingredient-categories" element={<IngredientCategoriesPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="stock-in" element={<StockInPage />} />
          <Route path="stock-out" element={<StockOutPage />} />
          <Route path="prep" element={<PrepPage />} />
          <Route path="stock-counts" element={<StockCountPage />} />
          <Route element={<ProtectedRoute roles={['MANAGER']} />}>
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="tables/manage" element={<ManageTablesPage />} />
            <Route path="loyalty" element={<LoyaltyPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="shifts" element={<ShiftsPage />} />
            <Route path="attendances" element={<AttendancePage />} />
            <Route path="payrolls" element={<PayrollPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
