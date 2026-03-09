import { usePortalAuth } from '@/hooks/usePortalAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, User, Briefcase, Mail, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const quickLinks = [
  { to: '/client/profile', icon: User, label: 'My Profile', desc: 'View and update your personal details' },
  { to: '/client/properties', icon: Building2, label: 'Properties', desc: 'View your property portfolio' },
  { to: '/client/employment', icon: Briefcase, label: 'Employment & Finances', desc: 'Employment and income details' },
  { to: '/client/emails', icon: Mail, label: 'Correspondence', desc: 'View email communications' },
  { to: '/client/documents', icon: FileText, label: 'Documents', desc: 'Access your uploaded documents' },
];

export default function PortalDashboard() {
  const { user } = usePortalAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.name || 'Client'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Access your property portfolio and account information below.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link key={link.to} to={link.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <link.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{link.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{link.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
