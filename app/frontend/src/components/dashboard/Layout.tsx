import Sidebar from './Sidebar';
import type { DashboardFilters } from '../../types/filters';

interface LayoutProps {
    children: React.ReactNode;
    onFilterChange: (filters: DashboardFilters) => void;
}

const Layout = ({ children, onFilterChange }: LayoutProps) => {
    return (
        <div className="flex h-screen bg-dark-900 text-slate-200 font-sans overflow-hidden">
            <Sidebar onFilterChange={onFilterChange} />
            <main className="flex-1 ml-80 p-8 overflow-y-auto h-screen relative">
                <div className="max-w-7xl mx-auto space-y-8 pb-20">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
