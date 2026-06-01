export default function TicketLoading() {
    return (
        <div className="min-h-screen bg-gray-50 animate-pulse pt-32 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
                    <div className="p-8">
                        <div className="h-8 w-48 bg-gray-100 rounded mx-auto mb-8" />
                        <div className="space-y-4">
                            <div className="h-4 w-3/4 bg-gray-100 rounded mx-auto" />
                            <div className="h-4 w-1/2 bg-gray-100 rounded mx-auto" />
                            <div className="h-4 w-2/3 bg-gray-100 rounded mx-auto" />
                        </div>
                        <div className="mt-8 h-40 bg-gray-100 rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    );
}
