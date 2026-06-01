export default function SetupProfileLoading() {
    return (
        <div className="min-h-screen bg-gray-50 animate-pulse pt-32 px-6">
            <div className="max-w-lg mx-auto">
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 p-8">
                    <div className="h-8 w-48 bg-gray-100 rounded mx-auto mb-8" />
                    <div className="space-y-6">
                        <div>
                            <div className="h-4 w-20 bg-gray-100 rounded mb-2" />
                            <div className="h-11 bg-gray-100 rounded-lg" />
                        </div>
                        <div>
                            <div className="h-4 w-16 bg-gray-100 rounded mb-2" />
                            <div className="h-11 bg-gray-100 rounded-lg" />
                        </div>
                        <div>
                            <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
                            <div className="h-11 bg-gray-100 rounded-lg" />
                        </div>
                        <div className="h-11 bg-gray-100 rounded-lg mt-8" />
                    </div>
                </div>
            </div>
        </div>
    );
}
