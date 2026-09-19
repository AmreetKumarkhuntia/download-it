import type { CSSProperties } from 'react';
import { Activity } from 'lucide-react';
import type { TransferModel } from '../../types/workspace';
import { Card } from '../cards/Card';

export function TransferDetails({ model }: { model: TransferModel }) {
  return (
    <Card as="section" className="parallel-section" aria-labelledby="parallel-title">
      <h3 id="parallel-title">
        <Activity className="icon" /> Parallel connections
      </h3>
      <div className="transfer-stats">
        <div>
          <span>Active connections</span>
          <strong>
            {model.connections}
            <small>{model.limit}</small>
          </strong>
        </div>
        <div>
          <span>Current speed</span>
          <strong>{model.speed}</strong>
        </div>
        <div>
          <span>Total speed cap</span>
          <strong>{model.speedCap}</strong>
        </div>
      </div>
      <p className="muted">{model.description}</p>
      {model.noRecord && (
        <p className="muted">
          No live engine record for this download. Saved progress and source information are shown
          below.
        </p>
      )}
      {model.pieces && (
        <div className="piece-section">
          <div className="piece-heading">
            <strong>{model.pieces.label}</strong>
            <span>{model.pieces.size}</span>
          </div>
          <div className="piece-map" role="img" aria-label={model.pieces.ariaLabel}>
            {model.pieces.groups.map((percent, index) => (
              <span
                key={index}
                title={`Piece group ${index + 1}: ${percent}% complete`}
                style={{ '--piece-completion': `${percent}%` } as CSSProperties}
              />
            ))}
          </div>
          <p className="muted">
            Green marks completed pieces. Each cell groups a consecutive part of the file; it does
            not represent a connection.
          </p>
        </div>
      )}
      {!!model.servers.length && (
        <div className="connection-table-wrap">
          <table className="connection-table">
            <caption>Connected servers · current snapshot</caption>
            <thead>
              <tr>
                <th>#</th>
                <th>Server</th>
                <th>Speed</th>
              </tr>
            </thead>
            <tbody>
              {model.servers.map((server, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{server.origin}</td>
                  <td>{server.speed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
