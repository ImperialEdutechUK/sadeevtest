import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/Misc';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <EmptyState title="We could not find that page" description="The link may be out of date or the item may have been removed." action={<Link to="/"><Button>Go to the home page</Button></Link>} />
  );
}
