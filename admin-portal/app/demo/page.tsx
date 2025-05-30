'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">HashScan</h1>
            <Button variant="default" size="sm">
              CONNECT WALLET
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold mb-2">Transaction 0.0.4513332@1748523926.473913669</h2>
        </div>

        <Card className="mb-6">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <h3 className="text-xl font-semibold">Transaction</h3>
              <Badge variant="success">SUCCESS</Badge>
            </div>

            <div className="space-y-4">
              <div className="hashscan-data-row">
                <div className="hashscan-data-label">ID</div>
                <div className="hashscan-data-value">0.0.4513332@1748523926.473913669</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">TYPE</div>
                <div className="hashscan-data-value">SUBMIT MESSAGE</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">CONSENSUS AT</div>
                <div className="hashscan-data-value">9:05:37.0261 AM, May 29, 2025, EDT</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">TRANSACTION HASH</div>
                <div className="hashscan-data-value text-xs">
                  0x087b489ec2da8b5a4bc7b76f14de7b8bc8d1144e71efe27978bb244d96161a49bb540a911f4cd017fb9f4ad21fc8afd
                </div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">BLOCK</div>
                <div className="hashscan-data-value">20240020</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">NODE SUBMITTED TO</div>
                <div className="hashscan-data-value">
                  0.0.4 <span className="text-primary">node2</span>
                </div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">MEMO</div>
                <div className="hashscan-data-value">None</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">TOPIC ID</div>
                <div className="hashscan-data-value">0.0.4513333</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">PAYER ACCOUNT</div>
                <div className="hashscan-data-value">0.0.4513332</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">CHARGED FEE</div>
                <div className="hashscan-data-value">
                  0.00055454ℏ <span className="text-destructive">$0.00010</span>
                </div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">MAX FEE</div>
                <div className="hashscan-data-value">
                  2.00000000ℏ <span className="text-destructive">$0.37434</span>
                </div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">HBAR PRICE</div>
                <div className="hashscan-data-value">$0.1872</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">VALID DURATION</div>
                <div className="hashscan-data-value">2min</div>
              </div>

              <div className="hashscan-data-row">
                <div className="hashscan-data-label">TRANSACTION NONCE</div>
                <div className="hashscan-data-value">0</div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-6">Transfers</h3>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-4">Hbar Transfers</h4>
              
              <table className="hashscan-table">
                <thead>
                  <tr>
                    <th>ACCOUNT</th>
                    <th className="text-right">AMOUNT</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">0.0.4513332</span>
                        <span className="text-destructive">-0.00055454ℏ</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <span className="text-destructive">-$0.00010</span>
                    </td>
                    <td className="text-muted-foreground">
                      Node fee (node2)
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">0.0.4</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-success">0.00002799ℏ</span>
                        <span className="text-success">$0.00001</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground">
                      Node reward account fee
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">0.0.801</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-success">0.00052655ℏ</span>
                        <span className="text-success">$0.00010</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground">
                      Node reward account fee
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}