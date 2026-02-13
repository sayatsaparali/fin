import { Navigate, Route, Routes } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import KycPage from './pages/KycPage';
import DashboardPage from './pages/DashboardPage';
import EmailVerificationPage from './pages/EmailVerificationPage';
import ProtectedRoute from './routes/ProtectedRoute';

function App() {
  return (
    <RootLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/kyc"
          element={
            <ProtectedRoute>
              <KycPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="/email-verification" element={<EmailVerificationPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </RootLayout>
  );
}

export default App;

