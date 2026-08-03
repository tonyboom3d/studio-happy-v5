// Page Not Found - Simplified version without BASE44
import React from 'react';
import { Link } from 'react-router-dom';

export default function PageNotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4" dir="rtl">
            <h1 className="text-4xl font-bold text-[#581E83] mb-4">404</h1>
            <p className="text-lg text-[#464646] mb-6">הדף לא נמצא</p>
            <Link
                to="/"
                className="px-6 py-3 bg-[#5E2F88] text-white rounded-lg hover:bg-[#7B3DB0] transition-colors"
            >
                חזרה לדף הראשי
            </Link>
        </div>
    );
}