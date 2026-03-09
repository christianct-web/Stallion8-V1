import { useNavigate } from "react-router-dom";
import { Plus, FileText, Copy, Trash2, MoreHorizontal, Search } from "lucide-react";
import { useDeclarationStore } from "@/store/declarationStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/StatusPill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

export default function DeclarationsList() {
  const navigate = useNavigate();
  const { declarations, createDeclaration, duplicateDeclaration, deleteDeclaration } =
    useDeclarationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredDeclarations = useMemo(() => {
    if (!searchQuery.trim()) return declarations;
    const query = searchQuery.toLowerCase();
    return declarations.filter(
      (d) =>
        d.reference_number.toLowerCase().includes(query) ||
        d.status.toLowerCase().includes(query)
    );
  }, [declarations, searchQuery]);

  const sortedDeclarations = useMemo(() => {
    return [...filteredDeclarations].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [filteredDeclarations]);

  const handleNewDeclaration = () => {
    const declaration = createDeclaration();
    navigate(`/declaration/${declaration.id}`);
  };

  const handleOpen = (id: string) => {
    navigate(`/declaration/${id}`);
  };

  const handleDuplicate = (id: string) => {
    const duplicated = duplicateDeclaration(id);
    if (duplicated) {
      navigate(`/declaration/${duplicated.id}`);
    }
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteDeclaration(deleteId);
      setDeleteId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Customs Declarations
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Trinidad & Tobago • ASYCUDA-Ready
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/stallion/workbench')}>Stallion Workbench</Button>
              <Button variant="outline" onClick={() => navigate('/stallion/brokerreview4')}>BrokerReview4</Button>
              <Button onClick={handleNewDeclaration} className="gap-2">
                <Plus className="h-4 w-4" />
                New Declaration
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by reference number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Declarations Table */}
        {sortedDeclarations.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery ? "No declarations found" : "No declarations yet"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? "Try adjusting your search query"
                : "Create your first customs declaration to get started"}
            </p>
            {!searchQuery && (
              <Button onClick={handleNewDeclaration} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Declaration
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full data-table">
              <thead>
                <tr className="border-b">
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    Reference Number
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    Status
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    Items
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground">
                    Last Updated
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDeclarations.map((declaration) => (
                  <tr
                    key={declaration.id}
                    className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleOpen(declaration.id)}
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium">
                        {declaration.reference_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill status={declaration.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {declaration.payload_json.items.length} item
                      {declaration.payload_json.items.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatDate(declaration.updated_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpen(declaration.id);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(declaration.id);
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(declaration.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-6 flex gap-4 text-sm text-muted-foreground">
          <span>
            {declarations.length} declaration{declarations.length !== 1 ? "s" : ""}
          </span>
          <span>•</span>
          <span>
            {declarations.filter((d) => d.status === "Draft").length} draft
          </span>
          <span>•</span>
          <span>
            {declarations.filter((d) => d.status === "Ready").length} ready
          </span>
          <span>•</span>
          <span>
            {declarations.filter((d) => d.status === "Exported").length} exported
          </span>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Declaration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this declaration? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
