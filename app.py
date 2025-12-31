import os
import base64
from io import BytesIO
import uuid
from werkzeug.utils import secure_filename
import numpy as np
import pandas as pd
from flask_cors import CORS
from flask import Flask, request, jsonify, send_from_directory
import seaborn as sns
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Must be before importing pyplot


app = Flask(__name__, static_folder='static')
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'csv', 'txt'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

dataframes = {}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def fig_to_base64(fig):
    buf = BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight',
                dpi=100, facecolor='white')
    buf.seek(0)
    img_str = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close(fig)
    return f"data:image/png;base64,{img_str}"


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed. Use CSV or TXT files.'}), 400

    try:
        file_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)

        if filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            content = file.read().decode('utf-8')
            file.seek(0)
            if '\t' in content:
                df = pd.read_csv(file, delimiter='\t')
            elif ';' in content:
                df = pd.read_csv(file, delimiter=';')
            else:
                df = pd.read_csv(file)

        dataframes[file_id] = df

        info = {
            'file_id': file_id,
            'filename': filename,
            'rows': len(df),
            'columns': len(df.columns),
            'column_names': df.columns.tolist(),
            'column_types': {col: str(dtype) for col, dtype in df.dtypes.items()},
            'preview': df.head(10).to_dict('records'),
            'memory_usage': f"{df.memory_usage(deep=True).sum() / 1024:.2f} KB"
        }

        return jsonify(info)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/basic-stats/<file_id>', methods=['GET'])
def basic_stats(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    try:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(
            include=['object', 'category']).columns.tolist()

        stats = {
            'shape': {'rows': len(df), 'columns': len(df.columns)},
            'numeric_columns': numeric_cols,
            'categorical_columns': categorical_cols,
            'missing_values': df.isnull().sum().to_dict(),
            'missing_percentage': (df.isnull().sum() / len(df) * 100).round(2).to_dict(),
            'duplicates': int(df.duplicated().sum()),
            'duplicate_percentage': round(df.duplicated().sum() / len(df) * 100, 2)
        }

        if numeric_cols:
            desc = df[numeric_cols].describe().round(3).to_dict()
            stats['numeric_stats'] = desc

        if categorical_cols:
            cat_stats = {}
            for col in categorical_cols[:10]:
                value_counts = df[col].value_counts().head(10).to_dict()
                unique_count = df[col].nunique()
                cat_stats[col] = {
                    'unique_count': unique_count,
                    'top_values': value_counts
                }
            stats['categorical_stats'] = cat_stats

        return jsonify(stats)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/correlation/<file_id>', methods=['GET'])
def correlation_analysis(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    try:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        if len(numeric_cols) < 2:
            return jsonify({'error': 'Need at least 2 numeric columns for correlation analysis'}), 400

        corr_matrix = df[numeric_cols].corr().round(3)

        fig, ax = plt.subplots(figsize=(10, 8))
        sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', center=0,
                    square=True, linewidths=0.5, ax=ax, fmt='.2f',
                    annot_kws={'size': 8})
        plt.title('Correlation Matrix Heatmap', fontsize=14, fontweight='bold')
        plt.tight_layout()

        heatmap_img = fig_to_base64(fig)

        strong_correlations = []
        for i in range(len(numeric_cols)):
            for j in range(i+1, len(numeric_cols)):
                corr_val = corr_matrix.iloc[i, j]
                if abs(corr_val) > 0.5:
                    strong_correlations.append({
                        'col1': numeric_cols[i],
                        'col2': numeric_cols[j],
                        'correlation': round(corr_val, 3)
                    })

        strong_correlations.sort(key=lambda x: abs(
            x['correlation']), reverse=True)

        return jsonify({
            'correlation_matrix': corr_matrix.to_dict(),
            'heatmap': heatmap_img,
            'strong_correlations': strong_correlations
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/distribution/<file_id>/<column>', methods=['GET'])
def distribution_analysis(file_id, column):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    if column not in df.columns:
        return jsonify({'error': f'Column {column} not found'}), 404

    try:
        col_data = df[column].dropna()

        if df[column].dtype in [np.int64, np.float64, np.int32, np.float32]:
            fig, axes = plt.subplots(1, 2, figsize=(14, 5))

            axes[0].hist(col_data, bins=30, edgecolor='black',
                         alpha=0.7, color='steelblue')
            axes[0].set_title(
                f'Distribution of {column}', fontsize=12, fontweight='bold')
            axes[0].set_xlabel(column)
            axes[0].set_ylabel('Frequency')
            axes[0].axvline(col_data.mean(), color='red',
                            linestyle='--', label=f'Mean: {col_data.mean():.2f}')
            axes[0].axvline(col_data.median(), color='green',
                            linestyle='--', label=f'Median: {col_data.median():.2f}')
            axes[0].legend()

            axes[1].boxplot(col_data, vert=True)
            axes[1].set_title(
                f'Box Plot of {column}', fontsize=12, fontweight='bold')
            axes[1].set_ylabel(column)

            plt.tight_layout()
            chart_img = fig_to_base64(fig)

            q1, q3 = col_data.quantile(0.25), col_data.quantile(0.75)
            iqr = q3 - q1
            outliers = col_data[(col_data < q1 - 1.5*iqr)
                                | (col_data > q3 + 1.5*iqr)]

            stats = {
                'type': 'numeric',
                'count': int(len(col_data)),
                'mean': round(col_data.mean(), 3),
                'median': round(col_data.median(), 3),
                'std': round(col_data.std(), 3),
                'min': round(col_data.min(), 3),
                'max': round(col_data.max(), 3),
                'q1': round(q1, 3),
                'q3': round(q3, 3),
                'skewness': round(col_data.skew(), 3),
                'kurtosis': round(col_data.kurtosis(), 3),
                'outliers_count': int(len(outliers)),
                'outliers_percentage': round(len(outliers) / len(col_data) * 100, 2)
            }

        else:
            value_counts = col_data.value_counts().head(20)

            fig, ax = plt.subplots(figsize=(12, 6))
            bars = ax.bar(range(len(value_counts)), value_counts.values,
                          color='steelblue', edgecolor='black')
            ax.set_xticks(range(len(value_counts)))
            ax.set_xticklabels(value_counts.index, rotation=45, ha='right')
            ax.set_title(f'Value Counts of {column}',
                         fontsize=12, fontweight='bold')
            ax.set_xlabel(column)
            ax.set_ylabel('Count')

            for bar, val in zip(bars, value_counts.values):
                ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                        str(val), ha='center', va='bottom', fontsize=8)

            plt.tight_layout()
            chart_img = fig_to_base64(fig)

            stats = {
                'type': 'categorical',
                'count': int(len(col_data)),
                'unique': int(col_data.nunique()),
                'top_value': str(col_data.mode().iloc[0]) if len(col_data.mode()) > 0 else None,
                'top_frequency': int(value_counts.iloc[0]) if len(value_counts) > 0 else 0,
                'value_counts': {str(k): int(v) for k, v in value_counts.to_dict().items()}
            }

        return jsonify({
            'column': column,
            'chart': chart_img,
            'stats': stats
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/scatter/<file_id>', methods=['POST'])
def scatter_plot(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]
    data = request.json

    x_col = data.get('x_column')
    y_col = data.get('y_column')
    hue_col = data.get('hue_column')

    if not x_col or not y_col:
        return jsonify({'error': 'Please provide x_column and y_column'}), 400

    try:
        fig, ax = plt.subplots(figsize=(10, 7))

        if hue_col and hue_col in df.columns:
            sns.scatterplot(data=df, x=x_col, y=y_col,
                            hue=hue_col, alpha=0.7, ax=ax)
            plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
        else:
            ax.scatter(df[x_col], df[y_col], alpha=0.7,
                       c='steelblue', edgecolors='black', linewidth=0.5)

        ax.set_xlabel(x_col, fontsize=11)
        ax.set_ylabel(y_col, fontsize=11)
        ax.set_title(f'{y_col} vs {x_col}', fontsize=14, fontweight='bold')

        if df[x_col].dtype in [np.int64, np.float64] and df[y_col].dtype in [np.int64, np.float64]:
            z = np.polyfit(df[x_col].dropna(), df[y_col].dropna(), 1)
            p = np.poly1d(z)
            x_line = np.linspace(df[x_col].min(), df[x_col].max(), 100)
            ax.plot(x_line, p(x_line), "r--", alpha=0.8, label='Trend line')
            ax.legend()

        plt.tight_layout()
        chart_img = fig_to_base64(fig)

        correlation = None
        if df[x_col].dtype in [np.int64, np.float64] and df[y_col].dtype in [np.int64, np.float64]:
            correlation = round(df[x_col].corr(df[y_col]), 3)

        return jsonify({
            'chart': chart_img,
            'correlation': correlation
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/pairplot/<file_id>', methods=['GET'])
def pairplot(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    try:
        numeric_cols = df.select_dtypes(
            include=[np.number]).columns.tolist()[:5]

        if len(numeric_cols) < 2:
            return jsonify({'error': 'Need at least 2 numeric columns'}), 400

        df_sample = df[numeric_cols]
        if len(df_sample) > 1000:
            df_sample = df_sample.sample(n=1000, random_state=42)

        fig = sns.pairplot(df_sample, diag_kind='hist',
                           plot_kws={'alpha': 0.6})
        fig.fig.suptitle('Pair Plot of Numeric Variables',
                         y=1.02, fontsize=14, fontweight='bold')

        chart_img = fig_to_base64(fig.fig)

        return jsonify({
            'chart': chart_img,
            'columns_used': numeric_cols
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/missing-analysis/<file_id>', methods=['GET'])
def missing_analysis(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    try:
        missing = df.isnull().sum()
        missing_pct = (missing / len(df) * 100).round(2)

        cols_with_missing = missing[missing > 0].sort_values(ascending=False)

        if len(cols_with_missing) == 0:
            return jsonify({
                'message': 'No missing values found in the dataset!',
                'total_missing': 0,
                'chart': None
            })

        fig, axes = plt.subplots(1, 2, figsize=(14, 6))

        colors = plt.cm.Reds(np.linspace(0.3, 0.8, len(cols_with_missing)))
        axes[0].barh(range(len(cols_with_missing)),
                     cols_with_missing.values, color=colors)
        axes[0].set_yticks(range(len(cols_with_missing)))
        axes[0].set_yticklabels(cols_with_missing.index)
        axes[0].set_xlabel('Number of Missing Values')
        axes[0].set_title('Missing Values by Column',
                          fontsize=12, fontweight='bold')
        axes[0].invert_yaxis()

        df_sample = df.head(50) if len(df) > 50 else df
        sns.heatmap(df_sample.isnull(), cbar=True,
                    yticklabels=False, ax=axes[1], cmap='YlOrRd')
        axes[1].set_title('Missing Values Pattern (First 50 Rows)',
                          fontsize=12, fontweight='bold')

        plt.tight_layout()
        chart_img = fig_to_base64(fig)

        return jsonify({
            'missing_counts': missing.to_dict(),
            'missing_percentages': missing_pct.to_dict(),
            'total_missing': int(missing.sum()),
            'total_missing_percentage': round(missing.sum() / (len(df) * len(df.columns)) * 100, 2),
            'columns_with_missing': cols_with_missing.to_dict(),
            'chart': chart_img
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/outliers/<file_id>', methods=['GET'])
def outlier_analysis(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    try:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        if len(numeric_cols) == 0:
            return jsonify({'error': 'No numeric columns found'}), 400

        outlier_info = {}

        for col in numeric_cols:
            col_data = df[col].dropna()
            q1, q3 = col_data.quantile(0.25), col_data.quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr

            outliers = col_data[(col_data < lower_bound) |
                                (col_data > upper_bound)]

            outlier_info[col] = {
                'count': int(len(outliers)),
                'percentage': round(len(outliers) / len(col_data) * 100, 2),
                'lower_bound': round(lower_bound, 3),
                'upper_bound': round(upper_bound, 3),
                'iqr': round(iqr, 3)
            }

        cols_with_outliers = [
            col for col, info in outlier_info.items() if info['count'] > 0][:8]

        if len(cols_with_outliers) > 0:
            n_cols = min(4, len(cols_with_outliers))
            n_rows = (len(cols_with_outliers) + n_cols - 1) // n_cols

            fig, axes = plt.subplots(
                n_rows, n_cols, figsize=(4*n_cols, 4*n_rows))
            axes = np.array(axes).flatten() if n_rows * n_cols > 1 else [axes]

            for i, col in enumerate(cols_with_outliers):
                axes[i].boxplot(df[col].dropna())
                axes[i].set_title(
                    f'{col}\n({outlier_info[col]["count"]} outliers)', fontsize=10)
                axes[i].set_ylabel(col)

            for j in range(len(cols_with_outliers), len(axes)):
                axes[j].set_visible(False)

            plt.suptitle('Outlier Detection (IQR Method)',
                         fontsize=14, fontweight='bold', y=1.02)
            plt.tight_layout()
            chart_img = fig_to_base64(fig)
        else:
            chart_img = None

        return jsonify({
            'outlier_info': outlier_info,
            'chart': chart_img,
            'total_columns_with_outliers': len(cols_with_outliers)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/groupby/<file_id>', methods=['POST'])
def groupby_analysis(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]
    data = request.json

    group_col = data.get('group_column')
    value_col = data.get('value_column')
    agg_func = data.get('aggregation', 'mean')

    if not group_col or not value_col:
        return jsonify({'error': 'Please provide group_column and value_column'}), 400

    try:
        if agg_func == 'mean':
            grouped = df.groupby(group_col)[value_col].mean()
        elif agg_func == 'sum':
            grouped = df.groupby(group_col)[value_col].sum()
        elif agg_func == 'count':
            grouped = df.groupby(group_col)[value_col].count()
        elif agg_func == 'median':
            grouped = df.groupby(group_col)[value_col].median()
        else:
            grouped = df.groupby(group_col)[value_col].mean()

        grouped = grouped.sort_values(ascending=False).head(20)

        fig, ax = plt.subplots(figsize=(12, 6))
        ax.bar(range(len(grouped)), grouped.values,
               color='steelblue', edgecolor='black')
        ax.set_xticks(range(len(grouped)))
        ax.set_xticklabels([str(x)[:20]
                           for x in grouped.index], rotation=45, ha='right')
        ax.set_xlabel(group_col)
        ax.set_ylabel(f'{agg_func.capitalize()} of {value_col}')
        ax.set_title(f'{agg_func.capitalize()} of {value_col} by {group_col}',
                     fontsize=12, fontweight='bold')

        plt.tight_layout()
        chart_img = fig_to_base64(fig)

        return jsonify({
            'chart': chart_img,
            'data': {str(k): round(v, 3) if isinstance(v, float) else v for k, v in grouped.to_dict().items()}
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/data-preview/<file_id>', methods=['GET'])
def data_preview(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    start = (page - 1) * per_page
    end = start + per_page

    data = df.iloc[start:end].to_dict('records')

    for row in data:
        for key, value in row.items():
            if pd.isna(value):
                row[key] = None
            elif isinstance(value, (np.integer, np.floating)):
                row[key] = float(value)

    return jsonify({
        'data': data,
        'total_rows': len(df),
        'page': page,
        'per_page': per_page,
        'total_pages': (len(df) + per_page - 1) // per_page
    })


@app.route('/api/columns/<file_id>', methods=['GET'])
def get_columns(file_id):
    if file_id not in dataframes:
        return jsonify({'error': 'File not found'}), 404

    df = dataframes[file_id]

    columns = []
    for col in df.columns:
        col_info = {
            'name': col,
            'dtype': str(df[col].dtype),
            'is_numeric': df[col].dtype in [np.int64, np.float64, np.int32, np.float32],
            'non_null_count': int(df[col].count()),
            'null_count': int(df[col].isnull().sum())
        }
        columns.append(col_info)

    return jsonify({'columns': columns})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
