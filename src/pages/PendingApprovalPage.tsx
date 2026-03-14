const PendingApprovalPage = () => (
  <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
    <div className="w-full max-w-md text-center space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Pending Approval</h1>
      <p className="text-muted-foreground">
        Your account is awaiting admin approval. Please contact the administrator to get access.
      </p>
    </div>
  </div>
);

export default PendingApprovalPage;
