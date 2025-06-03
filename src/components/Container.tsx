"use client"

import { useState } from "react"
import toast from "react-hot-toast"
import { useAccount, useReadContract, useWriteContract, useWatchContractEvent } from "wagmi"
import { TUGWAR_ABI, TUGWAR_CONTRACT_ADDRESS } from "../constants"
import { waitForTransactionReceipt } from "@wagmi/core"
import { config } from "../App"
import GameBoard from "./GameBoard"
import GameControls from "./GameControls"
import GameStats from "./GameStats"
import GameHistory from "./GameHistory"
import type { GameInfo, TeamStats, GamePrediction, GameEvent } from "../types/game"

const tugwarContract = {
    address: TUGWAR_CONTRACT_ADDRESS as `0x${string}`,
    abi: TUGWAR_ABI,
}

const Container = () => {
    const { address, isConnected } = useAccount()
    const { writeContractAsync } = useWriteContract()
    const [isLoading, setIsLoading] = useState(false)
    const [isResetting, setIsResetting] = useState(false)
    const [isShaking, setIsShaking] = useState(false)
    const [gameEvents, setGameEvents] = useState<GameEvent[]>([])

    // Read game information
    const { data: gameInfoData, refetch: refetchGameInfo } = useReadContract({
        ...tugwarContract,
        functionName: "getGameInfo",
        query: {
            enabled: isConnected,
            refetchInterval: 5000, // Refetch every 5 seconds
        },
    })

    // Read team 1 stats
    const { data: team1StatsData, refetch: refetchTeam1Stats } = useReadContract({
        ...tugwarContract,
        functionName: "getTeamStats",
        args: [1],
        query: {
            enabled: isConnected,
            refetchInterval: 5000,
        },
    })

    // Read team 2 stats
    const { data: team2StatsData, refetch: refetchTeam2Stats } = useReadContract({
        ...tugwarContract,
        functionName: "getTeamStats",
        args: [2],
        query: {
            enabled: isConnected,
            refetchInterval: 5000,
        },
    })

    // Read prediction
    const { data: predictionData, refetch: refetchPrediction } = useReadContract({
        ...tugwarContract,
        functionName: "getPrediction",
        query: {
            enabled: isConnected,
            refetchInterval: 5000,
        },
    })

    // Read owner
    const { data: ownerData } = useReadContract({
        ...tugwarContract,
        functionName: "owner",
        query: {
            enabled: isConnected,
        },
    })

    // Process data with proper type assertions and checks
    const gameInfo: GameInfo =
        gameInfoData && Array.isArray(gameInfoData)
            ? {
                ropePosition: Number(gameInfoData[0]),
                team1Score: Number(gameInfoData[1]),
                team2Score: Number(gameInfoData[2]),
                maxScoreDifference: Number(gameInfoData[3]),
                winner: Number(gameInfoData[4]),
                totalPulls: Number(gameInfoData[5]),
                gamesPlayed: Number(gameInfoData[6]),
            }
            : {
                ropePosition: 0,
                team1Score: 0,
                team2Score: 0,
                maxScoreDifference: 5,
                winner: 0,
                totalPulls: 0,
                gamesPlayed: 0,
            }

    const team1Stats: TeamStats =
        team1StatsData && Array.isArray(team1StatsData)
            ? {
                score: Number(team1StatsData[0]),
                isWinning: Boolean(team1StatsData[1]),
                scoreAdvantage: Number(team1StatsData[2]),
            }
            : { score: 0, isWinning: false, scoreAdvantage: 0 }

    const team2Stats: TeamStats =
        team2StatsData && Array.isArray(team2StatsData)
            ? {
                score: Number(team2StatsData[0]),
                isWinning: Boolean(team2StatsData[1]),
                scoreAdvantage: Number(team2StatsData[2]),
            }
            : { score: 0, isWinning: false, scoreAdvantage: 0 }

    const prediction: GamePrediction =
        predictionData && Array.isArray(predictionData)
            ? {
                predictedWinner: Number(predictionData[0]),
                confidence: Number(predictionData[1]),
            }
            : { predictedWinner: 0, confidence: 0 }

    const isOwner = address && ownerData && address.toLowerCase() === (ownerData as string).toLowerCase()

    // Watch for contract events
    useWatchContractEvent({
        ...tugwarContract,
        eventName: "PullExecuted",
        onLogs(logs) {
            console.log("Pull executed:", logs)
            triggerShake()
            refetchAll()

            // Add event to history
            const log = logs[0]
            if (log && "args" in log && log.args) {
                const args = log.args as {
                    player: string
                    isTeam1: boolean
                    newRopePosition: number
                    team1Score: number
                    team2Score: number
                }

                const { player, isTeam1, team1Score, team2Score } = args
                const newEvent: GameEvent = {
                    type: "pull",
                    player: player,
                    team: isTeam1 ? 1 : 2,
                    timestamp: Date.now(),
                }
                setGameEvents((prev) => [...prev, newEvent])

                // Show toast notification
                toast.success(`${isTeam1 ? "Team 1" : "Team 2"} pulled! Score: ${team1Score} - ${team2Score}`, {
                    style: {
                        background: "rgba(32, 0, 82, 0.95)",
                        color: "#FBFAF9",
                        border: "1px solid rgba(131, 110, 249, 0.3)",
                        borderRadius: "12px",
                        fontFamily: "Inter, sans-serif",
                    },
                })
            }
        },
    })

    useWatchContractEvent({
        ...tugwarContract,
        eventName: "GameWon",
        onLogs(logs) {
            console.log("Game won:", logs)
            refetchAll()

            // Add event to history
            const log = logs[0]
            if (log && "args" in log && log.args) {
                const args = log.args as {
                    winningTeam: number
                    finalScore1: number
                    finalScore2: number
                }

                const { winningTeam, finalScore1, finalScore2 } = args
                const newEvent: GameEvent = {
                    type: "win",
                    team: Number(winningTeam),
                    timestamp: Date.now(),
                }
                setGameEvents((prev) => [...prev, newEvent])

                // Show victory toast
                toast.success(`🎉 Team ${winningTeam} Wins! Final Score: ${finalScore1} - ${finalScore2}`, {
                    duration: 5000,
                    style: {
                        background: "rgba(32, 0, 82, 0.95)",
                        color: "#FBFAF9",
                        border: "1px solid rgba(131, 110, 249, 0.5)",
                        borderRadius: "12px",
                        fontFamily: "Inter, sans-serif",
                    },
                })
            }
        },
    })

    useWatchContractEvent({
        ...tugwarContract,
        eventName: "GameReset",
        onLogs(logs) {
            console.log("Game reset:", logs)
            refetchAll()

            // Add event to history and clear previous events
            const newEvent: GameEvent = {
                type: "reset",
                timestamp: Date.now(),
            }
            setGameEvents([newEvent]) // Reset history on game reset

            toast.success("Game has been reset!", {
                style: {
                    background: "rgba(32, 0, 82, 0.95)",
                    color: "#FBFAF9",
                    border: "1px solid rgba(160, 5, 93, 0.3)",
                    borderRadius: "12px",
                    fontFamily: "Inter, sans-serif",
                },
            })
        },
    })

    // Trigger rope shake animation
    const triggerShake = () => {
        setIsShaking(true)
        setTimeout(() => setIsShaking(false), 400)
    }

    // Refetch all data
    const refetchAll = () => {
        refetchGameInfo()
        refetchTeam1Stats()
        refetchTeam2Stats()
        refetchPrediction()
    }

    // Handle pull action
    const handlePull = async (isTeam1: boolean) => {
        if (!isConnected || gameInfo.winner !== 0) return

        setIsLoading(true)

        toast.loading(`Team ${isTeam1 ? "1" : "2"} is pulling...`, {
            style: {
                background: "rgba(32, 0, 82, 0.95)",
                color: "#FBFAF9",
                border: "1px solid rgba(131, 110, 249, 0.3)",
                borderRadius: "12px",
                fontFamily: "Inter, sans-serif",
            },
        })

        try {
            const result = await writeContractAsync({
                ...tugwarContract,
                functionName: "pull",
                args: [isTeam1],
                account: address as `0x${string}`,
            })

            toast.dismiss()
            toast.loading("Confirming pull...", {
                style: {
                    background: "rgba(32, 0, 82, 0.95)",
                    color: "#FBFAF9",
                    border: "1px solid rgba(131, 110, 249, 0.3)",
                    borderRadius: "12px",
                    fontFamily: "Inter, sans-serif",
                },
            })

            await waitForTransactionReceipt(config, {
                hash: result as `0x${string}`,
            })

            toast.dismiss()
            // Success toast will be handled by event listener
        } catch (error) {
            console.error("Pull failed:", error)
            toast.dismiss()
            toast.error("Pull failed. Please try again.", {
                style: {
                    background: "rgba(32, 0, 82, 0.95)",
                    color: "#FBFAF9",
                    border: "1px solid rgba(160, 5, 93, 0.5)",
                    borderRadius: "12px",
                    fontFamily: "Inter, sans-serif",
                },
            })
        } finally {
            setIsLoading(false)
        }
    }

    // Handle reset game (owner only)
    const handleReset = async () => {
        if (!isConnected || !isOwner) return

        setIsResetting(true)

        toast.loading("Resetting game...", {
            style: {
                background: "rgba(32, 0, 82, 0.95)",
                color: "#FBFAF9",
                border: "1px solid rgba(131, 110, 249, 0.3)",
                borderRadius: "12px",
                fontFamily: "Inter, sans-serif",
            },
        })

        try {
            const result = await writeContractAsync({
                ...tugwarContract,
                functionName: "reSet",
                args: [5], // Reset with default max score difference of 5
                account: address as `0x${string}`,
            })

            toast.dismiss()
            toast.loading("Confirming reset...", {
                style: {
                    background: "rgba(32, 0, 82, 0.95)",
                    color: "#FBFAF9",
                    border: "1px solid rgba(131, 110, 249, 0.3)",
                    borderRadius: "12px",
                    fontFamily: "Inter, sans-serif",
                },
            })

            await waitForTransactionReceipt(config, {
                hash: result as `0x${string}`,
            })

            toast.dismiss()
            // Success toast will be handled by event listener
        } catch (error) {
            console.error("Reset failed:", error)
            toast.dismiss()
            toast.error("Reset failed. Please try again.", {
                style: {
                    background: "rgba(32, 0, 82, 0.95)",
                    color: "#FBFAF9",
                    border: "1px solid rgba(160, 5, 93, 0.5)",
                    borderRadius: "12px",
                    fontFamily: "Inter, sans-serif",
                },
            })
        } finally {
            setIsResetting(false)
        }
    }

    return (
        <main className="min-h-screen pt-8 pb-16">
            <div className="container mx-auto px-6 max-w-7xl">
                {isConnected ? (
                    <div className="space-y-8">
                        <GameBoard gameInfo={gameInfo} isShaking={isShaking} />
                        <GameControls
                            onPull={handlePull}
                            isConnected={isConnected}
                            winner={gameInfo.winner}
                            isLoading={isLoading}
                        />
                        <GameStats
                            gameInfo={gameInfo}
                            team1Stats={team1Stats}
                            team2Stats={team2Stats}
                            prediction={prediction}
                            isOwner={Boolean(isOwner)}
                            onReset={handleReset}
                            isResetting={isResetting}
                        />
                        <GameHistory events={gameEvents} />
                    </div>
                ) : (
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <div className="glass card-hover rounded-2xl p-12 max-w-lg mx-auto text-center">
                            <div className="text-8xl mb-6 float-animation">🎮</div>
                            <h2 className="text-3xl font-bold mb-4 text-gradient-monad font-inter">Welcome to TugWar</h2>
                            <p className="mb-8 text-lg leading-relaxed" style={{ color: "rgba(251, 250, 249, 0.8)" }}>
                                Connect your wallet to join the ultimate blockchain tug of war battle. Choose your team and fight for
                                victory on the Monad testnet!
                            </p>
                            <div className="flex justify-center items-center space-x-8 text-sm">
                                <div
                                    className="flex items-center space-x-2 p-3 rounded-xl border"
                                    style={{
                                        backgroundColor: "rgba(131, 110, 249, 0.1)",
                                        borderColor: "rgba(131, 110, 249, 0.3)",
                                    }}
                                >
                                    <span className="text-2xl">🟣</span>
                                    <span className="font-medium" style={{ color: "#836EF9" }}>
                                        Team 1
                                    </span>
                                </div>
                                <div className="font-bold text-xl" style={{ color: "rgba(251, 250, 249, 0.6)" }}>
                                    VS
                                </div>
                                <div
                                    className="flex items-center space-x-2 p-3 rounded-xl border"
                                    style={{
                                        backgroundColor: "rgba(160, 5, 93, 0.1)",
                                        borderColor: "rgba(160, 5, 93, 0.3)",
                                    }}
                                >
                                    <span className="text-2xl">🔴</span>
                                    <span className="font-medium" style={{ color: "#A0055D" }}>
                                        Team 2
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}

export default Container