export default function EventsLoading() {
    return (
        <div className="min-h-screen bg-[#F8F9FA] animate-pulse pt-48 px-6">
            <div className="max-w-[1400px] mx-auto">
                <div className="text-center mb-24">
                    <div className="h-16 w-96 bg-gray-200 rounded mx-auto mb-6" />
                    <div className="h-5 w-64 bg-gray-100 rounded mx-auto" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4 max-w-[1100px] mx-auto">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-[2.5rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                            <div className="h-64 bg-gray-100" />
                            <div className="p-8">
                                <div className="h-6 w-3/4 bg-gray-100 rounded mb-3" />
                                <div className="h-4 w-1/2 bg-gray-100 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
