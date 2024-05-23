import { useState, useEffect, useRef } from 'react';

interface QueueItem {
    id: number;
    inputUrl: string;
    status: 0 | 1 | 2 | 3;
    progressPercentage: number;
    downloadSpeedInMBs: number
}

const statusMapping = {
    0: 'Paused',
    1: 'Downloading',
    2: 'Finished',
    3: 'Cancelled',
}

const QueueItemsList = (props: { dummy: string, onDownloadFinished: () => unknown }) => {
    const [data, setData] = useState<QueueItem[]>([])
    const [useHeadersForFilename, setUseHeadersForFilename] = useState(1)
    const socketRef = useRef<WebSocket | null>(null)

    useEffect(() => {
        const wsUrl = "/ws"
        socketRef.current = new WebSocket(wsUrl)
        
        socketRef.current.addEventListener('open', () => {
            console.log('Connected to the WebSocket server')
        })

        socketRef.current.addEventListener('message', (event) => {
            console.log('Message from server:', event.data)
            if (event.data.startsWith('progress:')) {
                const [, id, progress] = event.data.split(':')
                setData(prevData =>
                    prevData.map(item =>
                        item.id === Number(id) ? { ...item, status: 1, progressPercentage: Number(progress) } : item
                    )
                )
                // This helps provide accurate end-of-download information even if a refresh of the page occured
                if (Number(progress) === 100)
                {
                    setData(prevData =>
                        prevData.map(item =>
                            item.id === Number(id) ? { ...item, status: 2, progressPercentage: 100, downloadSpeedInMBs: 0 } : item
                        )
                    )
                }
            }
            else if (event.data.startsWith('speed:')) {
                const [, id, speed] = event.data.split(':')
                const formattedSpeed = (speed / 1024.0).toFixed(1) // Convert speed from KB/s to MB/s
                setData(prevData =>
                    prevData.map(item =>
                        item.id === Number(id) ? { ...item, downloadSpeedInMBs: Number(formattedSpeed) } : item
                    )
                )
            }
        })

        socketRef.current.addEventListener('close', () => {
            console.log('Disconnected from the WebSocket server')
        })

        socketRef.current.addEventListener('error', (error) => {
            console.error('WebSocket error:', error)
        })

        // Cleanup on component unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, [props.dummy])

    useEffect(() => {
        fetchList()
    }, [props.dummy])

    useEffect(() => {
        fetchList()
    }, [])

    useEffect(() => {
        const getFormattedDateTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };

        const interval = setInterval(() => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                console.log(`keep-alive: ${getFormattedDateTime()}`);
                socketRef.current.send(JSON.stringify({ type: 'keep-alive' }));
            }
        }, 50000); // Send a keep-alive message every 50 seconds

        return () => clearInterval(interval);
    }, [])

    const fetchList = async () => {
        try {
            const res = await fetch('/api/FileDownloadQueueItems')
            const result = await res.json()
            setData(result)
        } catch (err) {
            setData([])
            console.error(err)
        }
    }

    const requestDownload = async (id: number) => {
        try {
            const response = await fetch(`api/FileDownloadQueueItems/startdownload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id,
                    useHeadersForFilename: Boolean(useHeadersForFilename)
                }),
            })

            if (response.ok) {
                props.onDownloadFinished()
            } else {
                console.error('Failed to download item:', response.statusText)
            }
        } catch (error) {
            console.error('Error:', error)
        }
        finally {
            fetchList()
        }
    }

    const cancelDownload = async (id: number) => {
        try {
            const response = await fetch(`api/FileDownloadQueueItems/canceldownload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id
                }),
            });

            if (response.ok) {
                props.onDownloadFinished()
            } else {
                console.error('Failed to cancel item:', response.statusText)
            }
        } catch (error) {
            console.error('Error:', error)
        }
        finally {
            fetchList()
        }
    }

    const renderNode = (node: QueueItem) => {
        const handleDelete = async () => {
            try {
                const response = await fetch(`api/FileDownloadQueueItems/${node.id}`, {
                    method: 'DELETE',
                });

                if (!response.ok) {
                    console.error('Failed to delete item:', response.statusText)
                }
            } catch (error) {
                console.error('Error:', error)
            }
            finally {
                fetchList()
            }
        }

        return (
            <>
                <li key={node.id} className="flex items-center w-full p-1 text-sm font-medium text-left text-gray-800 rounded-lg focus:outline-none dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 m-1 dark:text-slate-300">
                        <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625Z" />
                        <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z" />
                    </svg>
                    {node.inputUrl}
                    <div className="ml-1 p-1 rounded-xl bg-gray-400 dark:bg-gray-700">{statusMapping[node.status]}</div>
                    <div className="ml-1 p-1 rounded-xl bg-gray-400 dark:bg-gray-700">{node.progressPercentage}% <span className="inline-block w-20 text-right">({node.downloadSpeedInMBs ?? 0} MB/s</span>)</div>
                    <select onChange={(e) => setUseHeadersForFilename(Number(e.target.value))} className="ml-1 p-1 rounded-xl bg-gray-400 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-[#FFFFFF33]">
                        <option value="1" className="dark:bg-gray-500">Use Headers For Filename</option>
                        <option value="0" className="dark:bg-gray-500">Use Url For Filename</option>
                    </select>
                    <div className="ml-1 px-2 rounded-xl bg-gray-400 dark:bg-gray-700">
                        <button onClick={handleDelete} className="p-1 rounded-full hover:bg-[#FFFFFF33]">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button onClick={() => cancelDownload(node.id)} className="p-1 rounded-full hover:bg-[#FFFFFF33]">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button onClick={() => requestDownload(node.id)} className="p-1 rounded-full hover:bg-[#FFFFFF33]">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M12 1.5a.75.75 0 0 1 .75.75V7.5h-1.5V2.25A.75.75 0 0 1 12 1.5ZM11.25 7.5v5.69l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V7.5h3.75a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3h3.75Z" />
                            </svg>
                        </button>
                    </div>
                </li>
            </>
        );
    };

    return (
        <div className="p-3 bg-slate-100 dark:bg-gray-600 rounded-md w-4/5 mx-auto my-1">
            <div className='flex flex-row'>
                <h3 className="font-bold text-lg ml-2 dark:text-slate-100">
                    Download Queue
                </h3>
                <button className="ml-2" onClick={fetchList}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 p-1 rounded-full hover:bg-[#FFFFFF33] dark:text-slate-100">
                        <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
            <ul className="bg-[#11111122] dark:bg-[#FFFFFF22] p-3 text-sm leading-6 rounded-md">
                {data && data.length > 0 ? (
                    data.map((node) => <div key={node.id}>{renderNode(node)}</div>)
                ) : (
                    <li className="text-center font-bold">Nothing to Show!</li>
                )}
            </ul>
        </div>
    );
}

export default QueueItemsList