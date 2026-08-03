import React, { createContext, useContext } from 'react';

// Simplified auth context - no actual authentication needed
// Data comes from Wix via postMessage
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  return (
    <AuthContext.Provider value={{
      user: null,
      isAuthenticated: false,
      isLoadingAuth: false,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Return safe defaults if used outside provider
    return { user: null, isAuthenticated: false, isLoadingAuth: false };
  }
  return context;
};
